import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock only the SDK and side-effect layers. The real ./firebase and
// ./userService modules run against these fakes.
const fakeAuth = vi.hoisted(() => ({
  currentUser: null,
  authStateReady: () => Promise.resolve(),
}));

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ name: 'test-app' })),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => fakeAuth),
  onAuthStateChanged: vi.fn(),
  signInAnonymously: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({ name: 'test-db' })),
  collection: vi.fn((db, name) => ({ path: name })),
  // doc(collectionRef) pre-allocates an ID, like the real SDK.
  doc: vi.fn((db, name, id) =>
    name === undefined ? { path: `${db.path}/r-new`, id: 'r-new' } : { path: `${name}/${id}`, id }
  ),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  writeBatch: vi.fn(),
  runTransaction: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn((ref) => ref),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  serverTimestamp: vi.fn(),
  onSnapshot: vi.fn(),
  getCountFromServer: vi.fn(),
  Timestamp: { fromDate: vi.fn((date) => ({ toDate: () => date })) },
}));

vi.mock('./emailService', () => ({
  generateBookingReference: vi.fn(() => 'REF-1'),
  sendCancellationEmail: vi.fn(),
}));

import { doc, getDoc, getDocs, runTransaction, where, writeBatch } from 'firebase/firestore';
import { createReservation, db, getReservations, getUserReservationCount } from './firebase';
import { getUserReservations } from './userService';

const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const futureEnd = new Date(futureStart.getTime() + 60 * 60 * 1000);

// Firestore-like timestamp readable both via toDate() and via seconds.
const ts = (date) => ({
  toDate: () => date,
  seconds: Math.floor(date.getTime() / 1000),
});

// Snapshot docs are plain objects, never functions, so calling the shadowed
// `doc(...)` on one fails the same way it does against real Firestore.
const reservationDoc = {
  id: 'r1',
  data: () => ({
    slot_id: 's1',
    user_email: 'user@example.com',
    status: 'confirmed',
    created_at: ts(new Date()),
    updated_at: ts(new Date()),
  }),
};

const querySnapshot = (docs) => ({
  empty: docs.length === 0,
  size: docs.length,
  docs,
  forEach: (cb) => docs.forEach(cb),
});

const slotSnapshot = {
  id: 's1',
  exists: () => true,
  data: () => ({
    start_time: ts(futureStart),
    end_time: ts(futureEnd),
    created_at: ts(new Date()),
    is_available: false,
  }),
};

const availableSlotSnapshot = {
  ...slotSnapshot,
  data: () => ({ ...slotSnapshot.data(), is_available: true }),
};

const visitor = { uid: 'visitor-uid', isAnonymous: true };

beforeEach(() => {
  vi.clearAllMocks();
  fakeAuth.currentUser = visitor;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(getDocs).mockResolvedValue(querySnapshot([reservationDoc]));
  vi.mocked(getDoc).mockResolvedValue(slotSnapshot);
});

describe('getReservations', () => {
  it('loads reservations with their slot data attached', async () => {
    const reservations = await getReservations();

    expect(doc).toHaveBeenCalledWith(db, 'slots', 's1');
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({ id: 'r1', slot_id: 's1' });
    expect(reservations[0].slots).toMatchObject({ id: 's1', start_time: futureStart });
  });
});

describe('getUserReservationCount', () => {
  it('counts an existing future reservation', async () => {
    const result = await getUserReservationCount();

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(doc).toHaveBeenCalledWith(db, 'slots', 's1');
  });

  // Replaces the mixed-case email test (#10): the limit now counts by owner
  // uid, so the case of the typed email no longer matters (#7).
  it("counts the signed-in visitor's confirmed reservations by uid", async () => {
    await getUserReservationCount();

    expect(where).toHaveBeenCalledWith('user_uid', '==', 'visitor-uid');
    expect(where).toHaveBeenCalledWith('status', '==', 'confirmed');
    expect(where).not.toHaveBeenCalledWith('user_email', expect.anything(), expect.anything());
  });

  it('returns 0 without querying when no one is signed in', async () => {
    fakeAuth.currentUser = null;

    const result = await getUserReservationCount();

    expect(result).toEqual({ success: true, count: 0, reservations: [] });
    expect(where).not.toHaveBeenCalled();
    expect(getDocs).not.toHaveBeenCalled();
  });
});

describe('getUserReservations', () => {
  it('loads user history with slot fields populated', async () => {
    const result = await getUserReservations();

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.reservations).toHaveLength(1);
    expect(result.reservations[0].slots).toMatchObject({
      id: 's1',
      start_time: new Date(Math.floor(futureStart.getTime() / 1000) * 1000),
    });
    expect(doc).toHaveBeenCalledWith(db, 'slots', 's1');
  });

  it("queries the signed-in visitor's reservations by uid", async () => {
    await getUserReservations();

    expect(where).toHaveBeenCalledWith('user_uid', '==', 'visitor-uid');
    expect(where).not.toHaveBeenCalledWith('user_email', expect.anything(), expect.anything());
  });

  it('returns no history without querying when no one is signed in', async () => {
    fakeAuth.currentUser = null;

    const result = await getUserReservations();

    expect(result).toEqual({ success: true, reservations: [] });
    expect(where).not.toHaveBeenCalled();
  });
});

describe('createReservation', () => {
  const mixedCaseUser = {
    name: 'Test User',
    email: 'User@Example.COM',
    groupId: 'g1',
    notes: '',
  };

  let transaction;

  beforeEach(() => {
    transaction = {
      get: vi.fn(() => Promise.resolve(availableSlotSnapshot)),
      set: vi.fn(),
      update: vi.fn(),
    };
    vi.mocked(runTransaction).mockImplementation((db, updateFunction) => updateFunction(transaction));
  });

  it('stores the reservation email lowercased', async () => {
    const reservation = await createReservation('s1', mixedCaseUser);

    expect(transaction.set).toHaveBeenCalledWith(
      { path: 'reservations/r-new', id: 'r-new' },
      expect.objectContaining({ user_email: 'user@example.com' })
    );
    expect(reservation.user_email).toBe('user@example.com');
  });

  it("links the reservation to the visitor's uid and takes the slot in the same transaction", async () => {
    const reservation = await createReservation('s1', mixedCaseUser);

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(transaction.get).toHaveBeenCalledWith({ path: 'slots/s1', id: 's1' });
    expect(transaction.set).toHaveBeenCalledWith(
      { path: 'reservations/r-new', id: 'r-new' },
      expect.objectContaining({ slot_id: 's1', user_uid: 'visitor-uid', status: 'confirmed' })
    );
    expect(transaction.update).toHaveBeenCalledWith(
      { path: 'slots/s1', id: 's1' },
      { is_available: false, reservation_id: 'r-new' }
    );
    expect(writeBatch).not.toHaveBeenCalled();
    expect(reservation.id).toBe('r-new');
  });

  it('refuses to book without a signed-in user', async () => {
    fakeAuth.currentUser = null;

    await expect(createReservation('s1', mixedCaseUser)).rejects.toThrow('signed in');
    expect(runTransaction).not.toHaveBeenCalled();
    expect(writeBatch).not.toHaveBeenCalled();
  });
});
