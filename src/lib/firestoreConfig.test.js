import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Static checks of firestore.rules and firestore.indexes.json against what
// the app actually sends (#7). They run in plain `npm test`, without the
// Firestore emulator: the emulator ignores indexes, and CI has no emulator.
// src/lib/firestore.rules.test.js runs the same shapes against the rules.

if (typeof globalThis.localStorage === 'undefined' && globalThis.jsdom) {
  vi.stubGlobal('localStorage', globalThis.jsdom.window.localStorage);
}

const h = vi.hoisted(() => {
  const state = {
    auth: { currentUser: null, authStateReady: () => Promise.resolve() },
    queries: [],
    batches: [],
    transactions: [],
    current: null,
    existingProfile: false,
    autoId: 0,
    serverTs: { __serverTimestamp: true },
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

vi.mock('firebase/firestore', () => {
  const emptySnapshot = { empty: true, size: 0, docs: [], forEach: () => {} };
  const readDoc = async (ref) => {
    if (ref.path.startsWith('slots/')) {
      const date = new Date(Date.now() + 86400000);
      return {
        id: ref.id,
        exists: () => true,
        data: () => ({
          start_time: { toDate: () => date },
          end_time: { toDate: () => date },
          created_at: { toDate: () => date },
          is_available: true,
          reservation_id: null,
        }),
      };
    }
    if (ref.path.startsWith('users/') && h.existingProfile) {
      return { id: ref.id, exists: () => true, data: () => ({}) };
    }
    return { id: ref.id, exists: () => false, data: () => undefined };
  };
  return {
    getFirestore: vi.fn(() => ({ name: 'test-db' })),
    collection: vi.fn((db, name) => ({ type: 'collection', path: name })),
    doc: vi.fn((parent, name, id) => {
      if (parent && parent.type === 'collection' && name === undefined) {
        h.autoId += 1;
        const autoId = `auto-${h.autoId}`;
        return { path: `${parent.path}/${autoId}`, id: autoId };
      }
      return { path: `${name}/${id}`, id };
    }),
    getDoc: vi.fn(readDoc),
    getDocs: vi.fn(async () => emptySnapshot),
    getCountFromServer: vi.fn(async () => ({ data: () => ({ count: 0 }) })),
    onSnapshot: vi.fn(() => () => {}),
    addDoc: vi.fn(async () => ({ id: 'added-1' })),
    setDoc: vi.fn(async () => {}),
    updateDoc: vi.fn(async () => {}),
    deleteDoc: vi.fn(async () => {}),
    writeBatch: vi.fn(() => {
      const batch = { set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => {}) };
      h.batches.push(batch);
      return batch;
    }),
    runTransaction: vi.fn(async (db, updateFunction) => {
      const transaction = { get: vi.fn(readDoc), set: vi.fn(), update: vi.fn(), delete: vi.fn() };
      h.transactions.push(transaction);
      return updateFunction(transaction);
    }),
    query: vi.fn((ref, ...constraints) => {
      const captured = { fn: h.current, collection: ref.path, constraints };
      h.queries.push(captured);
      return captured;
    }),
    where: vi.fn((field, op, value) => ({ kind: 'where', field, op, value })),
    orderBy: vi.fn((field, dir = 'asc') => ({ kind: 'orderBy', field, dir })),
    limit: vi.fn((n) => ({ kind: 'limit', n })),
    serverTimestamp: vi.fn(() => h.serverTs),
    Timestamp: { fromDate: vi.fn((date) => ({ __timestamp: true, toDate: () => date })) },
  };
});

vi.mock('./emailService', () => ({
  generateBookingReference: vi.fn(() => 'ADR-20260101-AB12'),
  sendCancellationEmail: vi.fn(),
}));

import { setDoc, updateDoc, addDoc } from 'firebase/firestore';
import * as firebaseLib from './firebase';
import * as userService from './userService';
import {
  APP_QUERIES,
  PROFILE_FIELDS,
  RESERVATION_FIELDS,
  profileData,
  reservationData,
} from './__fixtures__/firestoreShapes';

const VISITOR_UID = 'visitor-uid-1';
const SLOT_ID = 's1';

// Paths come from this file's location (vite rewrites `new URL(..., import.meta.url)`).
const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(LIB_DIR, '..');
const readRepoFile = (path) => readFileSync(join(LIB_DIR, '..', '..', path), 'utf8');
const rules = readRepoFile('firestore.rules');
const indexes = JSON.parse(readRepoFile('firestore.indexes.json')).indexes;

// Return the `match <header> { ... }` block of the rules (balanced braces).
function matchBlock(header) {
  const start = rules.indexOf(`match ${header}`);
  if (start < 0) return null;
  let depth = 0;
  for (let i = rules.indexOf('{', start + `match ${header}`.length); i < rules.length; i += 1) {
    if (rules[i] === '{') depth += 1;
    if (rules[i] === '}') {
      depth -= 1;
      if (depth === 0) return rules.slice(start, i + 1);
    }
  }
  return null;
}

// The `allow <ops>: if <condition>;` statement for exactly these ops.
function allowStatement(block, ops) {
  const re = new RegExp(`allow\\s+${ops.join('\\s*,\\s*')}\\s*:\\s*if([^;]*);`);
  const found = block && block.match(re);
  return found ? found[1].replace(/\s+/g, ' ').trim() : null;
}

// The list literal returned by `function <name>() { return [...]; }`.
function rulesKeyList(name) {
  const found = rules.match(new RegExp(`function\\s+${name}\\(\\)\\s*\\{\\s*return\\s*\\[([^\\]]*)\\]`));
  if (!found) return null;
  return [...found[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

const sorted = (list) => [...list].sort();

// Run every src/lib function that queries Firestore, as the app would.
const callers = {
  getAvailableSlots: () =>
    firebaseLib.getAvailableSlots(new Date(), new Date(Date.now() + 86400000)),
  subscribeToSlots: () => firebaseLib.subscribeToSlots(() => {}),
  getClosestAvailableSlot: () => firebaseLib.getClosestAvailableSlot(),
  getAvailableSlotsCount: () => firebaseLib.getAvailableSlotsCount(),
  getReservations: () => firebaseLib.getReservations(),
  deleteSlot: () => firebaseLib.deleteSlot(SLOT_ID),
  // The email argument is ignored once the lookups are scoped by uid.
  getUserReservationCount: () => firebaseLib.getUserReservationCount('ada@example.com'),
  getUserReservations: () => userService.getUserReservations('ada@example.com'),
};

function normalizeValue(value) {
  if (value && value.__timestamp) return '$time';
  if (value === VISITOR_UID) return '$uid';
  if (value === SLOT_ID) return '$slotId';
  return value;
}

function normalizeQuery({ fn, collection, constraints }) {
  return {
    fn,
    collection,
    constraints: constraints.map((c) => {
      if (c.kind === 'where') return ['where', c.field, c.op, normalizeValue(c.value)];
      if (c.kind === 'orderBy') return ['orderBy', c.field, c.dir];
      return ['limit', c.n];
    }),
  };
}

// The composite index a query needs, or null when single-field indexes
// (and index merging for equality-only filters) serve it.
function requiredIndex(shape) {
  const wheres = shape.constraints.filter(([kind]) => kind === 'where');
  const orders = shape.constraints
    .filter(([kind]) => kind === 'orderBy')
    .map(([, field, dir]) => ({ fieldPath: field, order: dir === 'desc' ? 'DESCENDING' : 'ASCENDING' }));
  const rangeFields = [...new Set(wheres.filter(([, , op]) => op !== '==').map(([, field]) => field))];
  for (const field of rangeFields) {
    if (!orders.some((o) => o.fieldPath === field)) orders.unshift({ fieldPath: field, order: 'ASCENDING' });
  }
  const ordered = new Set(orders.map((o) => o.fieldPath));
  const equality = [
    ...new Set(wheres.filter(([, , op]) => op === '==').map(([, field]) => field)),
  ].filter((field) => !ordered.has(field));
  if (orders.length === 0 || equality.length + orders.length <= 1) return null;
  return { collectionGroup: shape.collection, equality, orders };
}

function indexServes(index, need) {
  if (index.collectionGroup !== need.collectionGroup || index.queryScope !== 'COLLECTION') return false;
  if (index.fields.length !== need.equality.length + need.orders.length) return false;
  const head = index.fields.slice(0, need.equality.length).map((f) => f.fieldPath);
  const tail = index.fields.slice(need.equality.length);
  return (
    sorted(head).join() === sorted(need.equality).join() &&
    tail.every((f, i) => f.fieldPath === need.orders[i].fieldPath && f.order === need.orders[i].order)
  );
}

// An equality-only query that an index exists for (served faster than merging).
function indexMatchesEqualityQuery(index, shape) {
  const fields = shape.constraints
    .filter(([kind, , op]) => kind === 'where' && op === '==')
    .map(([, field]) => field);
  const onlyEquality = shape.constraints.every(([kind, , op]) => kind === 'where' && op === '==');
  return (
    onlyEquality &&
    index.collectionGroup === shape.collection &&
    sorted(index.fields.map((f) => f.fieldPath)).join() === sorted(fields).join()
  );
}

let captured = [];

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.auth.currentUser = { uid: VISITOR_UID, isAnonymous: true };
  for (const [name, call] of Object.entries(callers)) {
    h.current = name;
    await call();
  }
  // Writes must not hide extra queries either.
  h.current = 'registerUser';
  await userService.registerUser({ name: 'Ada Lovelace', email: 'Ada@Example.com', groupId: 'team_1' });
  h.current = 'createReservation';
  await firebaseLib.createReservation(SLOT_ID, {
    name: 'Ada Lovelace',
    email: 'Ada@Example.com',
    groupId: 'team_1',
    notes: '',
  });
  h.current = null;
  captured = h.queries.map(normalizeQuery);
});

describe('firestore.rules shape (docs/auth-model.md)', () => {
  it('uses the admins/{uid} allowlist, not a role custom claim', () => {
    expect(rules).not.toMatch(/request\.auth\.token\.role/);
    expect(rules).toMatch(
      /function\s+isAdmin\(\)\s*\{\s*return\s+isSignedIn\(\)\s*&&\s*exists\(\/databases\/\$\(database\)\/documents\/admins\/\$\(request\.auth\.uid\)\);/
    );
  });

  it('has no catch-all match, so unmatched paths are denied', () => {
    expect(rules).not.toMatch(/match\s+\/\{document=\*\*\}/);
  });

  it('never allows an unconditional create', () => {
    expect(rules).not.toMatch(/allow\s+[a-z, ]*create[a-z, ]*:\s*if\s+true\s*;/);
  });

  it('lets anyone read slots, so queries need not filter on is_available', () => {
    expect(allowStatement(matchBlock('/slots/{slotId}'), ['read'])).toBe('true');
    expect(allowStatement(matchBlock('/slots/{slotId}'), ['create', 'delete'])).toBe('isAdmin()');
  });

  it('lets a signed-in user read only their own admins/{uid} document, and nobody write it', () => {
    const admins = matchBlock('/admins/{adminId}');
    expect(allowStatement(admins, ['read'])).toBe('isSignedIn() && request.auth.uid == adminId');
    expect(allowStatement(admins, ['write'])).toBe('false');
  });

  it('keeps settings admin-only', () => {
    expect(allowStatement(matchBlock('/settings/{settingId}'), ['read', 'write'])).toBe('isAdmin()');
  });

  it('scopes visitor reservation reads to user_uid', () => {
    expect(allowStatement(matchBlock('/reservations/{reservationId}'), ['read'])).toBe(
      'isAdmin() || (isSignedIn() && resource.data.user_uid == request.auth.uid)'
    );
  });

  it('keeps users reads free of request.resource (it is null on reads)', () => {
    const users = matchBlock('/users/{userId}');
    const read = allowStatement(users, ['read']);
    expect(read).not.toBeNull();
    expect(read).not.toMatch(/request\.resource/);
    expect(allowStatement(users, ['create', 'update'])).toMatch(/validProfile\(\)/);
  });

  it('never reads a slot reservation_id that may be missing without a default', () => {
    // A free slot may have no reservation_id field at all; a missing field is
    // an error in rules, not null, so every read of the stored value must use
    // resource.data.get('reservation_id', null).
    expect(rules).toMatch(/reservation_id/);
    expect(rules).not.toMatch(/(?<!request\.)resource\.data\.reservation_id\b/);
  });
});

describe('firestore.indexes.json covers the queries src/lib runs', () => {
  it('captures every query( call in src/lib', () => {
    const sourceQueries = readdirSync(LIB_DIR)
      .filter((file) => file.endsWith('.js') && !file.endsWith('.test.js'))
      .reduce((total, file) => total + (readFileSync(join(LIB_DIR, file), 'utf8').match(/\bquery\(/g) || []).length, 0);

    expect(captured.map((q) => q.fn).sort()).toEqual(APP_QUERIES.map((q) => q.fn).sort());
    expect(captured).toHaveLength(sourceQueries);
  });

  it('matches the query shapes in the shared fixture', () => {
    for (const shape of APP_QUERIES) {
      const real = captured.find((q) => q.fn === shape.fn);
      expect(real, shape.fn).toEqual({
        fn: shape.fn,
        collection: shape.collection,
        constraints: shape.constraints,
      });
    }
  });

  it('filters every visitor reservation query by the signed-in uid', () => {
    const visitorQueries = captured.filter((q) =>
      ['getUserReservationCount', 'getUserReservations'].includes(q.fn)
    );
    expect(visitorQueries).toHaveLength(2);
    for (const q of visitorQueries) {
      expect(q.constraints, q.fn).toContainEqual(['where', 'user_uid', '==', '$uid']);
    }
  });

  it('has a composite index for every query that needs one', () => {
    const missing = captured
      .map((q) => ({ fn: q.fn, need: requiredIndex(q) }))
      .filter(({ need }) => need && !indexes.some((index) => indexServes(index, need)));
    expect(missing).toEqual([]);
  });

  it('has no index that no query uses', () => {
    const unused = indexes.filter(
      (index) =>
        !captured.some((q) => {
          const need = requiredIndex(q);
          return (need && indexServes(index, need)) || indexMatchesEqualityQuery(index, q);
        })
    );
    expect(unused).toEqual([]);
  });
});

describe('write payloads match the key lists in firestore.rules', () => {
  it('createReservation writes the reservation and takes the slot in one transaction', () => {
    const ruleKeys = rulesKeyList('reservationFields');
    expect(ruleKeys, 'firestore.rules defines reservationFields()').not.toBeNull();
    expect(sorted(RESERVATION_FIELDS)).toEqual(ruleKeys);
    expect(sorted(Object.keys(reservationData({ slotId: SLOT_ID, uid: VISITOR_UID, createdAt: 1 })))).toEqual(ruleKeys);

    expect(h.batches).toHaveLength(0);
    expect(h.transactions).toHaveLength(1);
    const [transaction] = h.transactions;
    expect(transaction.get).toHaveBeenCalledWith({ path: `slots/${SLOT_ID}`, id: SLOT_ID });
    expect(transaction.set).toHaveBeenCalledTimes(1);
    const [reservationRef, payload] = transaction.set.mock.calls[0];
    expect(reservationRef.path).toBe(`reservations/${reservationRef.id}`);
    expect(sorted(Object.keys(payload))).toEqual(ruleKeys);
    expect(payload).toMatchObject({
      slot_id: SLOT_ID,
      user_uid: VISITOR_UID,
      user_email: 'ada@example.com',
      status: 'confirmed',
    });
    expect(payload.created_at).toBe(h.serverTs);
    expect(transaction.update).toHaveBeenCalledTimes(1);
    expect(transaction.update).toHaveBeenCalledWith(
      { path: `slots/${SLOT_ID}`, id: SLOT_ID },
      { is_available: false, reservation_id: reservationRef.id }
    );
    expect(addDoc).not.toHaveBeenCalledWith({ type: 'collection', path: 'reservations' }, expect.anything());
  });

  it('registerUser writes users/{uid} with exactly the profile keys', async () => {
    const ruleKeys = rulesKeyList('profileFields');
    expect(ruleKeys, 'firestore.rules defines profileFields()').not.toBeNull();
    expect(sorted(PROFILE_FIELDS)).toEqual(ruleKeys);
    expect(sorted(Object.keys(profileData()))).toEqual(ruleKeys);

    const newProfile = vi.mocked(setDoc).mock.calls.find(([ref]) => ref.path.startsWith('users/'));
    expect(newProfile, 'registerUser calls setDoc on users/{uid}').toBeDefined();
    expect(newProfile[0].path).toBe(`users/${VISITOR_UID}`);
    expect(sorted(Object.keys(newProfile[1]))).toEqual(ruleKeys);
    expect(newProfile[1].email).toBe('ada@example.com');
    expect(newProfile[2]).toEqual({ merge: true });

    // An existing profile keeps its created_at; the merge supplies it.
    vi.mocked(setDoc).mockClear();
    h.existingProfile = true;
    await userService.registerUser({ name: 'Ada Lovelace', email: 'ada@example.com', groupId: '' });
    h.existingProfile = false;
    const [, update, options] = vi.mocked(setDoc).mock.calls[0];
    expect(sorted(Object.keys(update))).toEqual(ruleKeys.filter((key) => key !== 'created_at'));
    expect(options).toEqual({ merge: true });
  });

  it('writes reservation_id: null when a slot is created or reset', async () => {
    vi.mocked(addDoc).mockClear();
    await firebaseLib.createSlot({ start_time: new Date(), end_time: new Date() });
    expect(vi.mocked(addDoc).mock.calls[0][1]).toMatchObject({ is_available: true, reservation_id: null });

    vi.mocked(updateDoc).mockClear();
    await firebaseLib.resetSlotAvailability(SLOT_ID);
    expect(updateDoc).toHaveBeenCalledWith(expect.objectContaining({ path: `slots/${SLOT_ID}` }), {
      is_available: true,
      reservation_id: null,
    });
  });

  it('keeps the shared fixture out of app code', () => {
    const appFiles = readdirSync(SRC_DIR, { recursive: true })
      .map(String)
      .filter((file) => /\.(js|jsx)$/.test(file) && !/\.test\.jsx?$/.test(file) && !file.includes('__fixtures__'));
    const importers = appFiles.filter((file) =>
      readFileSync(join(SRC_DIR, file), 'utf8').includes('__fixtures__')
    );
    expect(importers).toEqual([]);
  });
});
