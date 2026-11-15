// @vitest-environment node
//
// Firestore security rules tests (#7). They run against the Firestore
// emulator and are skipped when FIRESTORE_EMULATOR_HOST is not set, so plain
// `npm test` (and CI, which has no Java or firebase-tools) skips them.
// Run them with `npm run test:rules` (see README, "Testing").
//
// Never import ./firebase here: it initializes the real app from .env*.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { APP_QUERIES, profileData, reservationData } from './__fixtures__/firestoreShapes';

const PROJECT_ID = 'demo-adr';
const RULES_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'firestore.rules');

const VISITOR_A = 'visitor-a';
const VISITOR_B = 'visitor-b';
const MEMBER = 'member-1'; // email/password account without an admins doc
const ADMIN = 'admin-1';

const anonymous = { firebase: { sign_in_provider: 'anonymous' } };
const password = (email) => ({ email, firebase: { sign_in_provider: 'password' } });

let testEnv;
const db = {};

const hours = (n) => Timestamp.fromMillis(Date.now() + n * 3600 * 1000);
const slot = (fields) => ({
  start_time: hours(48),
  end_time: hours(49),
  created_at: Timestamp.now(),
  ...fields,
});

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const store = context.firestore();
    await setDoc(doc(store, 'admins', ADMIN), { email: 'admin@example.com' });
    await setDoc(doc(store, 'settings', 'app'), { maintenance: false });
    // A free slot written before #7: no reservation_id field at all.
    await setDoc(doc(store, 'slots', 'no-pointer'), slot({ is_available: true }));
    await setDoc(doc(store, 'slots', 'free'), slot({ is_available: true, reservation_id: null }));
    await setDoc(doc(store, 'slots', 'other-free'), slot({ is_available: true, reservation_id: null }));
    await setDoc(doc(store, 'slots', 'taken-a'), slot({ is_available: false, reservation_id: 'res-a' }));
    await setDoc(
      doc(store, 'reservations', 'res-a'),
      reservationData({ slotId: 'taken-a', uid: VISITOR_A, createdAt: Timestamp.now() })
    );
    await setDoc(doc(store, 'slots', 'taken-b'), slot({ is_available: false, reservation_id: 'res-b' }));
    await setDoc(
      doc(store, 'reservations', 'res-b'),
      reservationData({ slotId: 'taken-b', uid: VISITOR_B, createdAt: Timestamp.now(), user_email: 'bob@example.com' })
    );
    // A reservation made before #7, without user_uid.
    const legacy = reservationData({ slotId: 'free', uid: 'x', createdAt: Timestamp.now() });
    delete legacy.user_uid;
    await setDoc(doc(store, 'reservations', 'legacy'), legacy);
    await setDoc(doc(store, 'users', VISITOR_B), profileData({ email: 'bob@example.com' }));
  });
}

// Build the query an app function runs from its shape in the shared fixture.
function appQuery(store, fn, { uid = VISITOR_A, slotId = 'taken-a' } = {}) {
  const shape = APP_QUERIES.find((q) => q.fn === fn);
  const value = (v) => {
    if (v === '$time') return Timestamp.now();
    if (v === '$uid') return uid;
    if (v === '$slotId') return slotId;
    return v;
  };
  const constraints = shape.constraints.map(([kind, field, op, v]) => {
    if (kind === 'where') return where(field, op, value(v));
    if (kind === 'orderBy') return orderBy(field, op);
    return limit(field);
  });
  const q = query(collection(store, shape.collection), ...constraints);
  return shape.kind === 'count' ? getCountFromServer(q) : getDocs(q);
}

// The booking write createReservation makes: one batch that creates the
// reservation and takes the slot.
function bookingBatch(store, { slotId, uid = VISITOR_A, reservation = {}, slotUpdate } = {}) {
  const reservationRef = doc(collection(store, 'reservations'));
  const batch = writeBatch(store);
  batch.set(reservationRef, reservationData({ slotId, uid, createdAt: serverTimestamp(), ...reservation }));
  batch.update(doc(store, 'slots', slotId), slotUpdate ?? { is_available: false, reservation_id: reservationRef.id });
  return { batch, reservationRef };
}

const book = (store, options) => bookingBatch(store, options).batch.commit();

// Visitor cancellation as one batch (the client side is #9's job).
function cancelBatch(store, reservationId, slotId) {
  const batch = writeBatch(store);
  batch.delete(doc(store, 'reservations', reservationId));
  batch.update(doc(store, 'slots', slotId), { is_available: true, reservation_id: null });
  return batch.commit();
}

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('firestore.rules (emulator)', { timeout: 30000 }, () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: readFileSync(RULES_PATH, 'utf8') },
    });
    db.anyone = testEnv.unauthenticatedContext().firestore();
    db.visitorA = testEnv.authenticatedContext(VISITOR_A, anonymous).firestore();
    db.visitorB = testEnv.authenticatedContext(VISITOR_B, anonymous).firestore();
    db.member = testEnv.authenticatedContext(MEMBER, password('member@example.com')).firestore();
    db.admin = testEnv.authenticatedContext(ADMIN, password('admin@example.com')).firestore();
  }, 60000);

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seed();
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  describe('every app query, per caller', () => {
    const publicSlotQueries = APP_QUERIES.filter((q) => q.collection === 'slots').map((q) => q.fn);

    for (const fn of publicSlotQueries) {
      it(`${fn} is allowed for anyone, visitors and admins`, async () => {
        await assertSucceeds(appQuery(db.anyone, fn));
        await assertSucceeds(appQuery(db.visitorA, fn));
        await assertSucceeds(appQuery(db.admin, fn));
      });
    }

    it('slot queries return taken-or-free slots only as filtered (no is_available read rule)', async () => {
      // A query that does not filter on is_available (checkSlotsExist, #11).
      await assertSucceeds(getDocs(query(collection(db.anyone, 'slots'), where('start_time', '>=', Timestamp.now()))));
      // verifySlotAvailability reads a taken slot by id.
      const snap = await assertSucceeds(getDoc(doc(db.anyone, 'slots', 'taken-a')));
      expect(snap.data().is_available).toBe(false);
    });

    for (const fn of ['getReservations', 'deleteSlot']) {
      it(`${fn} is allowed for admins only`, async () => {
        await assertSucceeds(appQuery(db.admin, fn));
        await assertFails(appQuery(db.visitorA, fn));
        await assertFails(appQuery(db.member, fn));
        await assertFails(appQuery(db.anyone, fn));
      });
    }

    it('P7: a visitor can run the history query (user_uid == uid, orderBy created_at desc)', async () => {
      const snap = await assertSucceeds(appQuery(db.visitorA, 'getUserReservations'));
      expect(snap.docs.map((d) => d.id)).toEqual(['res-a']);
    });

    it("P7: a visitor can run the count query (user_uid == uid, status == 'confirmed')", async () => {
      const snap = await assertSucceeds(appQuery(db.visitorA, 'getUserReservationCount'));
      expect(snap.docs.map((d) => d.id)).toEqual(['res-a']);
    });

    it('P7: an unfiltered reservations query by a visitor is denied', async () => {
      await assertFails(getDocs(collection(db.visitorA, 'reservations')));
      await assertFails(getDocs(query(collection(db.visitorA, 'reservations'), orderBy('created_at', 'desc'))));
      await assertFails(getDocs(query(collection(db.visitorA, 'reservations'), where('user_email', '==', 'ada@example.com'))));
    });

    it("P7: a visitor cannot query another visitor's reservations", async () => {
      await assertFails(appQuery(db.visitorA, 'getUserReservations', { uid: VISITOR_B }));
      await assertFails(appQuery(db.visitorA, 'getUserReservationCount', { uid: VISITOR_B }));
      await assertFails(appQuery(db.anyone, 'getUserReservations'));
    });

    it('admins can run the visitor queries too', async () => {
      await assertSucceeds(appQuery(db.admin, 'getUserReservations'));
      await assertSucceeds(appQuery(db.admin, 'getUserReservationCount'));
    });
  });

  describe('booking (createReservation)', () => {
    it('P5: a visitor books a slot that has no reservation_id field, in one batch', async () => {
      const { batch, reservationRef } = bookingBatch(db.visitorA, { slotId: 'no-pointer' });
      await assertSucceeds(batch.commit());
      const after = await getDoc(doc(db.anyone, 'slots', 'no-pointer'));
      expect(after.data()).toMatchObject({ is_available: false, reservation_id: reservationRef.id });
    });

    it('P5: a visitor books a slot whose reservation_id is null, in one batch', async () => {
      await assertSucceeds(book(db.visitorA, { slotId: 'free' }));
    });

    it('P5: a visitor books a slot in a transaction', async () => {
      const store = db.visitorA;
      await assertSucceeds(
        runTransaction(store, async (tx) => {
          const slotRef = doc(store, 'slots', 'no-pointer');
          const slotSnap = await tx.get(slotRef);
          if (!slotSnap.data().is_available) throw new Error('taken');
          const reservationRef = doc(collection(store, 'reservations'));
          tx.set(reservationRef, reservationData({ slotId: 'no-pointer', uid: VISITOR_A, createdAt: serverTimestamp() }));
          tx.update(slotRef, { is_available: false, reservation_id: reservationRef.id });
        })
      );
    });

    it('accepts a 200-character name and an empty group_id', async () => {
      await assertSucceeds(
        book(db.visitorA, { slotId: 'free', reservation: { user_name: 'n'.repeat(200), group_id: '' } })
      );
    });

    it('accepts 500 multibyte characters of notes (size() counts characters)', async () => {
      await assertSucceeds(book(db.visitorA, { slotId: 'free', reservation: { notes: 'é'.repeat(500) } }));
    });

    it('accepts a 100-character group_id and reference', async () => {
      await assertSucceeds(
        book(db.visitorA, { slotId: 'other-free', reservation: { group_id: 'g'.repeat(100), reference: 'r'.repeat(100) } })
      );
    });

    it('denies values over the caps', async () => {
      const over = [
        { user_name: 'n'.repeat(201) },
        { user_name: '' },
        { group_id: 'g'.repeat(101) },
        { notes: 'é'.repeat(501) },
        { reference: 'r'.repeat(101) },
        { user_email: `${'a'.repeat(250)}@example.com` },
      ];
      for (const reservation of over) {
        await assertFails(book(db.visitorA, { slotId: 'free', reservation }));
      }
    });

    it('denies a reservation that does not match the createReservation payload', async () => {
      const bad = [
        { user_email: 'Ada@Example.com' }, // stored lowercased (#10)
        { status: 'cancelled' },
        { created_at: Timestamp.now() }, // must be the server timestamp
        { extra: 'field' },
        { notes: null },
        { group_id: 42 },
      ];
      for (const reservation of bad) {
        await assertFails(book(db.visitorA, { slotId: 'free', reservation }));
      }
      // A missing key
      const { batch, reservationRef } = bookingBatch(db.visitorA, { slotId: 'free' });
      const missing = reservationData({ slotId: 'free', uid: VISITOR_A, createdAt: serverTimestamp() });
      delete missing.notes;
      batch.set(reservationRef, missing);
      await assertFails(batch.commit());
    });

    it('denies a reservation in the name of another user', async () => {
      await assertFails(book(db.visitorA, { slotId: 'free', uid: VISITOR_B }));
    });

    it('denies booking without a signed-in user', async () => {
      await assertFails(book(db.anyone, { slotId: 'free', uid: 'nobody' }));
    });

    it('denies a reservation created without taking its slot', async () => {
      const reservationRef = doc(collection(db.visitorA, 'reservations'));
      await assertFails(
        setDoc(reservationRef, reservationData({ slotId: 'free', uid: VISITOR_A, createdAt: serverTimestamp() }))
      );
    });

    it('denies taking a slot without creating its reservation', async () => {
      await assertFails(updateDoc(doc(db.visitorA, 'slots', 'free'), { is_available: false, reservation_id: 'made-up' }));
      await assertFails(updateDoc(doc(db.visitorA, 'slots', 'free'), { is_available: false }));
      // Pointing at an existing reservation is not a new booking either.
      await assertFails(updateDoc(doc(db.visitorA, 'slots', 'free'), { is_available: false, reservation_id: 'res-a' }));
    });

    it('denies double booking a taken slot', async () => {
      await assertFails(book(db.visitorB, { slotId: 'taken-a', uid: VISITOR_B }));
      await assertSucceeds(book(db.visitorA, { slotId: 'free' }));
      await assertFails(book(db.visitorB, { slotId: 'free', uid: VISITOR_B }));
    });

    it('denies a reservation for one slot that takes another', async () => {
      // The reservation names 'free' but the batch takes 'other-free'.
      const { batch, reservationRef } = bookingBatch(db.visitorA, {
        slotId: 'other-free',
        reservation: { slot_id: 'free' },
      });
      expect(reservationRef.id).toBeTruthy();
      await assertFails(batch.commit());
    });

    it('denies a booking that also edits the slot times', async () => {
      const { batch, reservationRef } = bookingBatch(db.visitorA, { slotId: 'free' });
      batch.update(doc(db.visitorA, 'slots', 'free'), {
        is_available: false,
        reservation_id: reservationRef.id,
        start_time: hours(1),
      });
      await assertFails(batch.commit());
    });
  });

  describe('cancellation', () => {
    it('allows a visitor to cancel their confirmed reservation in one batch', async () => {
      await assertSucceeds(cancelBatch(db.visitorA, 'res-a', 'taken-a'));
      const after = await getDoc(doc(db.anyone, 'slots', 'taken-a'));
      expect(after.data()).toMatchObject({ is_available: true, reservation_id: null });
    });

    it("denies today's two-call cancellation at its first call (note 3, #9)", async () => {
      await assertFails(deleteDoc(doc(db.visitorA, 'reservations', 'res-a')));
    });

    it('denies freeing a slot without deleting its reservation', async () => {
      await assertFails(updateDoc(doc(db.visitorA, 'slots', 'taken-a'), { is_available: true, reservation_id: null }));
      await assertFails(updateDoc(doc(db.visitorA, 'slots', 'taken-a'), { is_available: true }));
    });

    it("denies cancelling another visitor's reservation", async () => {
      await assertFails(cancelBatch(db.visitorA, 'res-b', 'taken-b'));
    });

    it('denies cancelling a reservation an admin already cancelled', async () => {
      await assertSucceeds(updateDoc(doc(db.admin, 'reservations', 'res-a'), { status: 'cancelled' }));
      await assertFails(cancelBatch(db.visitorA, 'res-a', 'taken-a'));
    });
  });

  describe('reservations: reads and admin writes', () => {
    it('a visitor reads their own reservation, not anyone else’s', async () => {
      await assertSucceeds(getDoc(doc(db.visitorA, 'reservations', 'res-a')));
      await assertFails(getDoc(doc(db.visitorA, 'reservations', 'res-b')));
      await assertFails(getDoc(doc(db.anyone, 'reservations', 'res-a')));
    });

    it('reservations without user_uid are visible to admins only', async () => {
      await assertFails(getDoc(doc(db.visitorA, 'reservations', 'legacy')));
      await assertSucceeds(getDoc(doc(db.admin, 'reservations', 'legacy')));
    });

    it('a visitor cannot update a reservation', async () => {
      await assertFails(updateDoc(doc(db.visitorA, 'reservations', 'res-a'), { notes: 'changed' }));
    });

    it('an admin changes a status, deletes a reservation and resets its slot', async () => {
      // updateReservationStatus
      await assertSucceeds(
        updateDoc(doc(db.admin, 'reservations', 'res-b'), {
          status: 'cancelled',
          status_reason: 'Lab closed',
          updated_at: serverTimestamp(),
        })
      );
      await assertSucceeds(getDoc(doc(db.admin, 'reservations', 'res-b')));
      // deleteReservation, then resetSlotAvailability
      await assertSucceeds(deleteDoc(doc(db.admin, 'reservations', 'res-a')));
      await assertSucceeds(updateDoc(doc(db.admin, 'slots', 'taken-a'), { is_available: true, reservation_id: null }));
    });
  });

  describe('slots: admin only, apart from the bound availability flip', () => {
    it('an admin creates, edits and deletes slots', async () => {
      await assertSucceeds(setDoc(doc(db.admin, 'slots', 'new'), slot({ is_available: true, reservation_id: null })));
      await assertSucceeds(updateDoc(doc(db.admin, 'slots', 'new'), { start_time: hours(72), end_time: hours(73) }));
      await assertSucceeds(deleteDoc(doc(db.admin, 'slots', 'new')));
    });

    for (const who of ['visitorA', 'member', 'anyone']) {
      it(`P8: ${who} cannot create or delete a slot`, async () => {
        await assertFails(setDoc(doc(db[who], 'slots', 'new'), slot({ is_available: true, reservation_id: null })));
        await assertFails(deleteDoc(doc(db[who], 'slots', 'free')));
      });

      it(`P8: ${who} cannot change start_time or end_time`, async () => {
        await assertFails(updateDoc(doc(db[who], 'slots', 'free'), { start_time: hours(1) }));
        await assertFails(updateDoc(doc(db[who], 'slots', 'free'), { end_time: hours(100) }));
      });
    }
  });

  describe('settings', () => {
    for (const who of ['anyone', 'visitorA', 'member']) {
      it(`P8: ${who} cannot read or write settings`, async () => {
        await assertFails(getDoc(doc(db[who], 'settings', 'app')));
        await assertFails(setDoc(doc(db[who], 'settings', 'app'), { maintenance: true }));
      });
    }

    it('an admin reads and writes settings', async () => {
      await assertSucceeds(getDoc(doc(db.admin, 'settings', 'app')));
      await assertSucceeds(setDoc(doc(db.admin, 'settings', 'app'), { maintenance: true }));
    });
  });

  describe('admins allowlist', () => {
    it('P6: an admin reads their own admins/{uid} (admin login)', async () => {
      const snap = await assertSucceeds(getDoc(doc(db.admin, 'admins', ADMIN)));
      expect(snap.exists()).toBe(true);
    });

    it('P6: a signed-in non-admin can getDoc their own missing admins/{uid}', async () => {
      const snap = await assertSucceeds(getDoc(doc(db.member, 'admins', MEMBER)));
      expect(snap.exists()).toBe(false);
      await assertSucceeds(getDoc(doc(db.visitorA, 'admins', VISITOR_A)));
    });

    it("nobody reads someone else's admins doc or writes the allowlist", async () => {
      await assertFails(getDoc(doc(db.member, 'admins', ADMIN)));
      await assertFails(getDoc(doc(db.anyone, 'admins', ADMIN)));
      await assertFails(setDoc(doc(db.member, 'admins', MEMBER), { email: 'member@example.com' }));
      await assertFails(setDoc(doc(db.admin, 'admins', 'someone'), { email: 'x@example.com' }));
      await assertFails(deleteDoc(doc(db.admin, 'admins', ADMIN)));
    });
  });

  describe('users profiles (registerUser)', () => {
    it('P6: a visitor can getDoc their own missing users/{uid}', async () => {
      const snap = await assertSucceeds(getDoc(doc(db.visitorA, 'users', VISITOR_A)));
      expect(snap.exists()).toBe(false);
    });

    it('a visitor creates, then updates, their profile with merge writes', async () => {
      const ref = doc(db.visitorA, 'users', VISITOR_A);
      await assertSucceeds(setDoc(ref, profileData({ group_id: '' }), { merge: true }));
      const update = profileData({ name: 'Ada King', group_id: 'g'.repeat(100), updated_at: '2026-02-01T10:00:00.000Z' });
      delete update.created_at;
      await assertSucceeds(setDoc(ref, update, { merge: true }));
    });

    it('denies invalid profile writes', async () => {
      const ref = doc(db.visitorA, 'users', VISITOR_A);
      for (const fields of [
        { email: 'Ada@Example.com' },
        { group_id: 'g'.repeat(101) },
        { name: 'n'.repeat(201) },
        { extra: true },
        { created_at: 'yesterday' },
      ]) {
        await assertFails(setDoc(ref, profileData(fields), { merge: true }));
      }
      const noCreatedAt = profileData();
      delete noCreatedAt.created_at;
      await assertFails(setDoc(ref, noCreatedAt, { merge: true }));
    });

    it('keeps created_at fixed once the profile exists', async () => {
      const ref = doc(db.visitorB, 'users', VISITOR_B);
      await assertFails(setDoc(ref, { created_at: '2020-01-01T00:00:00.000Z' }, { merge: true }));
    });

    it("denies reading or writing another visitor's profile, and deleting profiles", async () => {
      await assertFails(getDoc(doc(db.visitorA, 'users', VISITOR_B)));
      await assertFails(setDoc(doc(db.visitorA, 'users', VISITOR_B), profileData(), { merge: true }));
      await assertFails(deleteDoc(doc(db.visitorB, 'users', VISITOR_B)));
      await assertFails(getDoc(doc(db.anyone, 'users', VISITOR_B)));
    });

    it('an admin reads any profile', async () => {
      await assertSucceeds(getDoc(doc(db.admin, 'users', VISITOR_B)));
    });
  });

  it('denies paths no rule matches', async () => {
    await assertFails(getDoc(doc(db.admin, 'unknown', 'x')));
    await assertFails(setDoc(doc(db.admin, 'unknown', 'x'), { a: 1 }));
  });
});
