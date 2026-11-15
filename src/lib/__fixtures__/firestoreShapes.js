// Test-only description of what the app sends to Firestore. App code never
// imports this file.
//
// src/lib/firestoreConfig.test.js checks these shapes against the payloads and
// queries the real src/lib functions produce, and against the key lists in
// firestore.rules. src/lib/firestore.rules.test.js replays the same shapes
// against the rules in the Firestore emulator. If a src/lib query or write
// changes, the static test fails until this file (and so the emulator suite)
// follows.

// Keys createReservation writes to reservations/{id}.
export const RESERVATION_FIELDS = [
  'slot_id',
  'user_uid',
  'user_name',
  'user_email',
  'group_id',
  'notes',
  'status',
  'reference',
  'created_at',
];

// Keys registerUser writes to users/{uid} (after the merge).
export const PROFILE_FIELDS = ['name', 'email', 'group_id', 'created_at', 'updated_at'];

/**
 * A reservation document as createReservation writes it.
 * `createdAt` is the server timestamp sentinel of the SDK in use.
 */
export function reservationData({ slotId, uid, createdAt, ...overrides }) {
  return {
    slot_id: slotId,
    user_uid: uid,
    user_name: 'Ada Lovelace',
    user_email: 'ada@example.com',
    group_id: 'team_1',
    notes: '',
    status: 'confirmed',
    reference: 'ADR-20260101-AB12',
    created_at: createdAt,
    ...overrides,
  };
}

/** A users/{uid} profile as registerUser writes it for a new visitor. */
export function profileData(overrides = {}) {
  const now = '2026-01-01T09:30:00.000Z';
  return {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    group_id: 'team_1',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// Every query src/lib runs. Placeholders: '$time' is a Timestamp, '$uid' the
// signed-in user's uid, '$slotId' the slot id argument.
// `caller` is who runs it in the app: 'anyone', 'visitor' or 'admin'.
export const APP_QUERIES = [
  {
    fn: 'getAvailableSlots',
    caller: 'anyone',
    collection: 'slots',
    kind: 'getDocs',
    constraints: [
      ['where', 'start_time', '>=', '$time'],
      ['where', 'start_time', '<=', '$time'],
      ['where', 'is_available', '==', true],
      ['orderBy', 'start_time', 'asc'],
    ],
  },
  {
    fn: 'subscribeToSlots',
    caller: 'anyone',
    collection: 'slots',
    kind: 'onSnapshot',
    constraints: [
      ['where', 'is_available', '==', true],
      ['orderBy', 'start_time', 'asc'],
    ],
  },
  {
    fn: 'getClosestAvailableSlot',
    caller: 'anyone',
    collection: 'slots',
    kind: 'getDocs',
    constraints: [
      ['where', 'start_time', '>=', '$time'],
      ['where', 'is_available', '==', true],
      ['orderBy', 'start_time', 'asc'],
      ['limit', 1],
    ],
  },
  {
    fn: 'getAvailableSlotsCount',
    caller: 'admin',
    collection: 'slots',
    kind: 'count',
    constraints: [
      ['where', 'start_time', '>=', '$time'],
      ['where', 'is_available', '==', true],
    ],
  },
  {
    fn: 'getReservations',
    caller: 'admin',
    collection: 'reservations',
    kind: 'getDocs',
    constraints: [['orderBy', 'created_at', 'desc']],
  },
  {
    fn: 'deleteSlot',
    caller: 'admin',
    collection: 'reservations',
    kind: 'getDocs',
    constraints: [['where', 'slot_id', '==', '$slotId']],
  },
  {
    fn: 'getUserReservationCount',
    caller: 'visitor',
    collection: 'reservations',
    kind: 'getDocs',
    constraints: [
      ['where', 'user_uid', '==', '$uid'],
      ['where', 'status', '==', 'confirmed'],
    ],
  },
  {
    fn: 'getUserReservations',
    caller: 'visitor',
    collection: 'reservations',
    kind: 'getDocs',
    constraints: [
      ['where', 'user_uid', '==', '$uid'],
      ['orderBy', 'created_at', 'desc'],
    ],
  },
];
