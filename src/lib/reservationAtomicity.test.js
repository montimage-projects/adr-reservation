import { describe, it, expect, vi, beforeEach } from 'vitest';

// Booking and visitor cancellation must be all-or-nothing (#9,
// docs/auth-model.md). The real ./firebase and ./userService run against an
// in-memory Firestore fake. runTransaction models optimistic concurrency like
// the SDK: reads record a document version, writes are buffered, and the
// commit re-runs the callback when a document it read has changed since.

const h = vi.hoisted(() => {
  const state = {
    auth: { currentUser: null, authStateReady: () => Promise.resolve() },
    docs: new Map(), // path -> data
    versions: new Map(), // path -> version, bumped on every write
    clock: 0,
    nextId: 0,
    batches: [],
    transactions: [],
    barrier: null,
    rejectWritesTo: null,
  };

  state.reset = () => {
    state.docs.clear();
    state.versions.clear();
    state.clock = 0;
    state.nextId = 0;
    state.batches = [];
    state.transactions = [];
    state.barrier = null;
    state.rejectWritesTo = null;
  };

  state.version = (path) => state.versions.get(path) ?? 0;

  state.snapshot = (ref) => {
    const data = state.docs.get(ref.path);
    return {
      id: ref.id,
      exists: () => data !== undefined,
      data: () => (data === undefined ? undefined : { ...data }),
    };
  };

  // Hold every caller until `count` slot reads are in flight, so concurrent
  // bookings all read before any of them writes. Later readers pass through.
  state.setBarrier = (count) => {
    let release;
    const promise = new Promise((resolve) => {
      release = resolve;
    });
    state.barrier = { waiting: count, promise, release };
  };
  state.arrive = async () => {
    if (!state.barrier) return;
    state.barrier.waiting -= 1;
    if (state.barrier.waiting <= 0) state.barrier.release();
    await state.barrier.promise;
  };

  // The server rejects any commit that touches this path.
  state.checkWritable = (writes) => {
    if (writes.some((w) => w.ref.path === state.rejectWritesTo)) {
      throw new Error('PERMISSION_DENIED: write rejected');
    }
  };

  // Apply writes in one synchronous step, so a commit is atomic.
  state.apply = (writes) => {
    for (const w of writes) {
      if (w.op === 'set') {
        state.docs.set(w.ref.path, { ...w.data });
      } else if (w.op === 'update') {
        if (!state.docs.has(w.ref.path)) throw new Error(`NOT_FOUND: ${w.ref.path}`);
        state.docs.set(w.ref.path, { ...state.docs.get(w.ref.path), ...w.data });
      } else if (w.op === 'delete') {
        state.docs.delete(w.ref.path);
      }
      state.clock += 1;
      state.versions.set(w.ref.path, state.clock);
    }
  };

  return state;
});

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ name: 'test-app' })),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => h.auth),
  onAuthStateChanged: vi.fn(),
  signInAnonymously: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({ name: 'test-db' })),
  collection: vi.fn((db, name) => ({ type: 'collection', path: name })),
  // doc(collectionRef) pre-allocates a new ID on every call, like the SDK.
  doc: vi.fn((parent, name, id) => {
    if (parent && parent.type === 'collection' && name === undefined) {
      h.nextId += 1;
      const autoId = `r-${h.nextId}`;
      return { path: `${parent.path}/${autoId}`, id: autoId };
    }
    return { path: `${name}/${id}`, id };
  }),
  getDoc: vi.fn(async (ref) => {
    if (ref.path.startsWith('slots/')) await h.arrive();
    return h.snapshot(ref);
  }),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(async (ref, data) => {
    const writes = [{ op: 'update', ref, data }];
    h.checkWritable(writes);
    h.apply(writes);
  }),
  deleteDoc: vi.fn(async (ref) => {
    const writes = [{ op: 'delete', ref }];
    h.checkWritable(writes);
    h.apply(writes);
  }),
  writeBatch: vi.fn(() => {
    const writes = [];
    const batch = {
      writes,
      set: vi.fn((ref, data) => {
        writes.push({ op: 'set', ref, data });
        return batch;
      }),
      update: vi.fn((ref, data) => {
        writes.push({ op: 'update', ref, data });
        return batch;
      }),
      delete: vi.fn((ref) => {
        writes.push({ op: 'delete', ref });
        return batch;
      }),
      commit: vi.fn(async () => {
        h.checkWritable(writes);
        h.apply(writes);
      }),
    };
    h.batches.push(batch);
    return batch;
  }),
  runTransaction: vi.fn(async (db, updateFunction) => {
    const record = { attempts: [] };
    h.transactions.push(record);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const reads = new Map();
      const writes = [];
      const tx = {
        writes,
        get: vi.fn(async (ref) => {
          if (writes.length > 0) {
            throw new Error('Firestore transactions require all reads to be executed before all writes.');
          }
          reads.set(ref.path, h.version(ref.path));
          const snap = h.snapshot(ref);
          if (ref.path.startsWith('slots/')) await h.arrive();
          return snap;
        }),
        set: vi.fn((ref, data) => {
          writes.push({ op: 'set', ref, data });
          return tx;
        }),
        update: vi.fn((ref, data) => {
          writes.push({ op: 'update', ref, data });
          return tx;
        }),
        delete: vi.fn((ref) => {
          writes.push({ op: 'delete', ref });
          return tx;
        }),
      };
      record.attempts.push(tx);
      // An error thrown by the callback aborts the transaction, no retry.
      const result = await updateFunction(tx);
      // Commit: validate the read set and apply the writes in one step.
      const stale = [...reads].some(([path, version]) => h.version(path) !== version);
      if (stale) continue; // discard buffered writes and retry
      h.checkWritable(writes);
      h.apply(writes);
      return result;
    }
    throw new Error('ABORTED: too much contention');
  }),
  query: vi.fn((ref) => ref),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  onSnapshot: vi.fn(),
  getCountFromServer: vi.fn(),
  Timestamp: { fromDate: vi.fn((date) => ({ toDate: () => date })) },
}));

vi.mock('./emailService', () => ({
  generateBookingReference: vi.fn(() => 'ADR-20260101-AB12'),
  sendCancellationEmail: vi.fn(async () => ({ success: true })),
}));

import { deleteDoc, getDoc, runTransaction, updateDoc, writeBatch } from 'firebase/firestore';
import { sendCancellationEmail } from './emailService';
import { createReservation } from './firebase';
import { cancelReservation } from './userService';
import { RESERVATION_FIELDS } from './__fixtures__/firestoreShapes';

const VISITOR_UID = 'visitor-uid';
const SLOT_PATH = 'slots/s1';
const slotStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);
const ts = (date) => ({ toDate: () => date, seconds: Math.floor(date.getTime() / 1000) });

const visitorDetails = { name: 'Ada Lovelace', email: 'Ada@Example.com', groupId: 'team_1', notes: '' };

const putSlot = (fields = {}) => {
  h.apply([
    {
      op: 'set',
      ref: { path: SLOT_PATH },
      data: {
        start_time: ts(slotStart),
        end_time: ts(slotEnd),
        created_at: ts(new Date()),
        is_available: true,
        reservation_id: null,
        ...fields,
      },
    },
  ]);
};

const reservationPaths = () => [...h.docs.keys()].filter((path) => path.startsWith('reservations/'));
const allAttempts = () => h.transactions.flatMap((t) => t.attempts);

beforeEach(() => {
  vi.clearAllMocks();
  h.reset();
  h.auth.currentUser = { uid: VISITOR_UID, isAnonymous: true };
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('createReservation runs in one transaction (AC1)', () => {
  it('reads the slot and writes the reservation and the slot inside the same transaction', async () => {
    putSlot();

    const reservation = await createReservation('s1', visitorDetails);

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(getDoc).not.toHaveBeenCalled();
    expect(writeBatch).not.toHaveBeenCalled();

    const [tx] = allAttempts();
    expect(tx.get).toHaveBeenCalledWith({ path: SLOT_PATH, id: 's1' });
    expect(tx.set).toHaveBeenCalledTimes(1);
    const [reservationRef, payload] = tx.set.mock.calls[0];
    expect(reservationRef).toEqual({ path: `reservations/${reservation.id}`, id: reservation.id });
    expect(Object.keys(payload).sort()).toEqual([...RESERVATION_FIELDS].sort());
    expect(payload).toMatchObject({ slot_id: 's1', user_uid: VISITOR_UID, user_email: 'ada@example.com' });
    expect(tx.update).toHaveBeenCalledWith(
      { path: SLOT_PATH, id: 's1' },
      { is_available: false, reservation_id: reservation.id }
    );
    // All reads come before the writes.
    expect(tx.get.mock.invocationCallOrder[0]).toBeLessThan(tx.set.mock.invocationCallOrder[0]);
    expect(tx.get.mock.invocationCallOrder[0]).toBeLessThan(tx.update.mock.invocationCallOrder[0]);

    expect(h.docs.get(SLOT_PATH)).toMatchObject({ is_available: false, reservation_id: reservation.id });
    expect(reservation.slots).toMatchObject({ id: 's1', start_time: slotStart, end_time: slotEnd });
  });
});

describe('concurrent bookings of one slot (AC2)', () => {
  it('creates exactly one reservation when two visitors book the same slot at once', async () => {
    putSlot();
    h.setBarrier(2); // both bookings read the free slot before either commits

    const results = await Promise.allSettled([
      createReservation('s1', visitorDetails),
      createReservation('s1', { ...visitorDetails, name: 'Grace Hopper', email: 'grace@example.com' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.message).toBe('Slot is no longer available');

    // The loser read the free slot, lost the commit and retried.
    expect(h.transactions.map((t) => t.attempts.length).sort()).toEqual([1, 2]);

    const winner = fulfilled[0].value;
    expect(reservationPaths()).toEqual([`reservations/${winner.id}`]);
    expect(h.docs.get(SLOT_PATH)).toMatchObject({ is_available: false, reservation_id: winner.id });
  });
});

describe('a failed booking leaves no orphan reservation (AC3)', () => {
  it('writes nothing when the slot is already taken', async () => {
    putSlot({ is_available: false, reservation_id: 'r-other' });
    const before = { ...h.docs.get(SLOT_PATH) };

    await expect(createReservation('s1', visitorDetails)).rejects.toThrow('Slot is no longer available');

    expect(runTransaction).toHaveBeenCalledTimes(1);
    for (const tx of allAttempts()) {
      expect(tx.set).not.toHaveBeenCalled();
      expect(tx.update).not.toHaveBeenCalled();
    }
    expect(reservationPaths()).toEqual([]);
    expect(h.docs.get(SLOT_PATH)).toEqual(before);
  });

  it('writes nothing when the slot does not exist', async () => {
    await expect(createReservation('s1', visitorDetails)).rejects.toThrow('Slot not found');

    for (const tx of allAttempts()) {
      expect(tx.set).not.toHaveBeenCalled();
      expect(tx.update).not.toHaveBeenCalled();
    }
    expect(h.docs.size).toBe(0);
  });

  it('keeps no reservation and leaves the slot free when the commit fails', async () => {
    putSlot();
    h.rejectWritesTo = SLOT_PATH;

    await expect(createReservation('s1', visitorDetails)).rejects.toThrow('PERMISSION_DENIED');

    expect(reservationPaths()).toEqual([]);
    expect(h.docs.get(SLOT_PATH)).toMatchObject({ is_available: true, reservation_id: null });
  });
});

describe('cancelReservation releases the slot in one batched write', () => {
  const putConfirmedReservation = () => {
    putSlot({ is_available: false, reservation_id: 'r1' });
    h.apply([
      {
        op: 'set',
        ref: { path: 'reservations/r1' },
        data: {
          slot_id: 's1',
          user_uid: VISITOR_UID,
          user_name: 'Ada Lovelace',
          user_email: 'ada@example.com',
          group_id: 'team_1',
          notes: '',
          status: 'confirmed',
          reference: 'ADR-20260101-AB12',
          created_at: ts(new Date()),
        },
      },
    ]);
  };

  it('deletes the reservation and frees the slot in a single commit', async () => {
    putConfirmedReservation();

    const result = await cancelReservation('r1');

    expect(result).toEqual({ success: true });
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
    expect(h.batches).toHaveLength(1);
    const [batch] = h.batches;
    expect(batch.writes).toEqual([
      { op: 'delete', ref: { path: 'reservations/r1', id: 'r1' } },
      { op: 'update', ref: { path: SLOT_PATH, id: 's1' }, data: { is_available: true, reservation_id: null } },
    ]);
    expect(batch.commit).toHaveBeenCalledTimes(1);

    expect(reservationPaths()).toEqual([]);
    expect(h.docs.get(SLOT_PATH)).toMatchObject({ is_available: true, reservation_id: null });
    expect(sendCancellationEmail).toHaveBeenCalledTimes(1);
  });

  it('changes nothing when the write is rejected', async () => {
    putConfirmedReservation();
    h.rejectWritesTo = SLOT_PATH;

    const result = await cancelReservation('r1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch('PERMISSION_DENIED');
    expect(reservationPaths()).toEqual(['reservations/r1']);
    expect(h.docs.get(SLOT_PATH)).toMatchObject({ is_available: false, reservation_id: 'r1' });
    expect(sendCancellationEmail).not.toHaveBeenCalled();
  });

  it('reports a missing reservation without writing', async () => {
    const result = await cancelReservation('missing');

    expect(result).toEqual({ success: false, error: 'Reservation not found' });
    expect(writeBatch).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
  });
});
