import { describe, it, expect, vi, beforeEach } from 'vitest';

// Visitor sessions (#6): the browser-signed visitor JWT is replaced by the
// Firebase Auth user, normally an anonymous one (docs/auth-model.md).

// Newer Node versions define their own global `localStorage`, which hides
// jsdom's. Fall back to jsdom's storage so the test runs on any Node.
if (typeof globalThis.localStorage === 'undefined' && globalThis.jsdom) {
  vi.stubGlobal('localStorage', globalThis.jsdom.window.localStorage);
}

const fakeAuth = vi.hoisted(() => ({
  currentUser: null,
  authStateReady: vi.fn(() => Promise.resolve()),
}));

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ name: 'test-app' })),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => fakeAuth),
  signInWithEmailAndPassword: vi.fn(),
  signInAnonymously: vi.fn(),
  onAuthStateChanged: vi.fn(),
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

import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { addDoc, getDocs } from 'firebase/firestore';
import { startAnonymousSession } from './firebase';
import { getCurrentUser, isUserAuthenticated, logoutUser, registerUser } from './userService';

const visitor = { uid: 'anon-uid', isAnonymous: true };
const details = { name: 'Ada', email: 'Ada@Example.com', groupId: 'g1' };

beforeEach(() => {
  vi.clearAllMocks();
  fakeAuth.currentUser = null;
  localStorage.clear();
  getDocs.mockResolvedValue({ empty: true, docs: [] });
  addDoc.mockResolvedValue({ id: 'profile-1' });
});

describe('anonymous sign-in bootstrap', () => {
  it('signs in anonymously whenever there is no current user', () => {
    signInAnonymously.mockResolvedValue({ user: visitor });
    startAnonymousSession();

    const listener = onAuthStateChanged.mock.calls[0][1];
    listener(null);
    expect(signInAnonymously).toHaveBeenCalledWith(fakeAuth);

    signInAnonymously.mockClear();
    listener(visitor);
    expect(signInAnonymously).not.toHaveBeenCalled();
  });
});

describe('visitor session', () => {
  it('is not authenticated by a stored token alone', async () => {
    localStorage.setItem('user_token', 'forged.token.value');
    localStorage.setItem('userData', JSON.stringify(details));

    await expect(isUserAuthenticated()).resolves.toBe(false);
  });

  it('signs in anonymously before saving details, then counts as a session', async () => {
    signInAnonymously.mockImplementation(async () => {
      fakeAuth.currentUser = visitor;
      return { user: visitor };
    });

    const result = await registerUser(details);

    expect(result.success).toBe(true);
    expect(result.token).toBeUndefined();
    expect(signInAnonymously).toHaveBeenCalledWith(fakeAuth);
    expect(signInAnonymously.mock.invocationCallOrder[0])
      .toBeLessThan(addDoc.mock.invocationCallOrder[0]);
    await expect(isUserAuthenticated()).resolves.toBe(true);
  });

  it('reuses an existing Firebase user', async () => {
    fakeAuth.currentUser = visitor;

    await registerUser(details);

    expect(signInAnonymously).not.toHaveBeenCalled();
    await expect(isUserAuthenticated()).resolves.toBe(true);
  });

  it('does not carry a session over to a different Firebase user', async () => {
    fakeAuth.currentUser = visitor;
    await registerUser(details);

    fakeAuth.currentUser = { uid: 'someone-else', isAnonymous: true };
    await expect(isUserAuthenticated()).resolves.toBe(false);
  });

  it('logout ends the session but keeps details for the booking form', async () => {
    fakeAuth.currentUser = visitor;
    await registerUser(details);

    logoutUser();

    await expect(isUserAuthenticated()).resolves.toBe(false);
    expect(getCurrentUser()).toEqual(details);
  });
});
