import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock only the SDK and side-effect layers. The real ./firebase and
// ./userService modules run against these fakes.
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ name: 'test-app' })),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({ name: 'test-db' })),
  collection: vi.fn((db, name) => ({ path: name })),
  doc: vi.fn((db, name, id) => ({ path: `${name}/${id}` })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
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

import { addDoc, doc, getDoc, getDocs, where } from 'firebase/firestore';
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

beforeEach(() => {
  vi.clearAllMocks();
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
    const result = await getUserReservationCount('User@Example.com');

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(doc).toHaveBeenCalledWith(db, 'slots', 's1');
  });
});

describe('getUserReservations', () => {
  it('loads user history with slot fields populated', async () => {
    const result = await getUserReservations('user@example.com');

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.reservations).toHaveLength(1);
    expect(result.reservations[0].slots).toMatchObject({
      id: 's1',
      start_time: new Date(Math.floor(futureStart.getTime() / 1000) * 1000),
    });
    expect(doc).toHaveBeenCalledWith(db, 'slots', 's1');
  });
});

describe('createReservation', () => {
  const mixedCaseUser = {
    name: 'Test User',
    email: 'User@Example.COM',
    groupId: 'g1',
    notes: '',
  };

  beforeEach(() => {
    vi.mocked(getDoc).mockResolvedValueOnce(availableSlotSnapshot);
    vi.mocked(addDoc).mockResolvedValueOnce({ id: 'r-new' });
  });

  it('stores the reservation email lowercased', async () => {
    const reservation = await createReservation('s1', mixedCaseUser);

    expect(addDoc).toHaveBeenCalledWith(
      { path: 'reservations' },
      expect.objectContaining({ user_email: 'user@example.com' })
    );
    expect(reservation.user_email).toBe('user@example.com');
  });

  it('counts a mixed-case reservation toward the one-active-reservation limit', async () => {
    await createReservation('s1', mixedCaseUser);
    const stored = vi.mocked(addDoc).mock.calls[0][1];

    // Emulate Firestore's exact-match equality filter on user_email.
    vi.mocked(getDocs).mockImplementationOnce(async () => {
      const emailFilter = vi.mocked(where).mock.calls.find(([field]) => field === 'user_email');
      const matches = emailFilter && emailFilter[2] === stored.user_email;
      return querySnapshot(matches ? [{ id: 'r-new', data: () => stored }] : []);
    });

    const result = await getUserReservationCount(mixedCaseUser.email);

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
  });
});
