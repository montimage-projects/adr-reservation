import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Regression test for #6: admin login used to be checked in the browser by
// comparing a 32-bit hash and signing a JWT with a secret shipped in the
// bundle. Admin credentials must now be verified by Firebase Auth, and admin
// rights come from an `admins/{uid}` document (docs/auth-model.md).

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
  setDoc: vi.fn(),
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

import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDoc, setDoc } from 'firebase/firestore';
import * as authService from './authService';

const adminUser = { uid: 'admin-uid', isAnonymous: false };

function readSource(name) {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeAuth.currentUser = null;
  localStorage.clear();
});

describe('admin login (#6)', () => {
  it('verifies the credentials with Firebase Auth and checks admins/{uid}', async () => {
    signInWithEmailAndPassword.mockResolvedValue({ user: adminUser });
    getDoc.mockResolvedValue({ exists: () => true });

    const result = await authService.loginAdmin('admin@example.com', 'correct horse');

    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
      fakeAuth,
      'admin@example.com',
      'correct horse'
    );
    expect(getDoc).toHaveBeenCalledWith({ path: 'admins/admin-uid' });
    expect(result.success).toBe(true);
    expect(signOut).not.toHaveBeenCalled();
    // No browser-signed token is issued or stored.
    expect(result.token).toBeUndefined();
    expect(localStorage.getItem('admin_token')).toBeNull();
  });

  it('signs out and fails when the account has no admins/{uid} document', async () => {
    signInWithEmailAndPassword.mockResolvedValue({ user: adminUser });
    getDoc.mockResolvedValue({ exists: () => false });

    const result = await authService.loginAdmin('someone@example.com', 'pw');

    expect(result.success).toBe(false);
    expect(signOut).toHaveBeenCalledWith(fakeAuth);
  });

  it('signs out and fails when the admin check is denied', async () => {
    signInWithEmailAndPassword.mockResolvedValue({ user: adminUser });
    getDoc.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));

    const result = await authService.loginAdmin('admin@example.com', 'pw');

    expect(result.success).toBe(false);
    expect(signOut).toHaveBeenCalledWith(fakeAuth);
  });

  it('returns a generic failure for wrong credentials', async () => {
    signInWithEmailAndPassword.mockRejectedValue(
      Object.assign(new Error('bad'), { code: 'auth/invalid-credential' })
    );

    const result = await authService.loginAdmin('admin@example.com', 'wrong');

    expect(result.success).toBe(false);
    expect(result.message).toBe('Invalid email or password');
    expect(getDoc).not.toHaveBeenCalled();
  });
});

describe('admin session check (#6)', () => {
  it('waits for the persisted session and accepts an allowlisted user', async () => {
    fakeAuth.currentUser = adminUser;
    getDoc.mockResolvedValue({ exists: () => true });

    await expect(authService.isAdminAuthenticated()).resolves.toBe(true);
    expect(fakeAuth.authStateReady).toHaveBeenCalled();
  });

  it('rejects anonymous visitors without reading Firestore', async () => {
    fakeAuth.currentUser = { uid: 'visitor', isAnonymous: true };

    await expect(authService.isAdminAuthenticated()).resolves.toBe(false);
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('treats a denied admin check as not signed in', async () => {
    fakeAuth.currentUser = adminUser;
    getDoc.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));

    await expect(authService.isAdminAuthenticated()).resolves.toBe(false);
  });

  it('ignores a forged admin_token in localStorage', async () => {
    localStorage.setItem('admin_token', 'forged.token.value');

    await expect(authService.isAdminAuthenticated()).resolves.toBe(false);
  });
});

describe('no in-app password setup or client-side signing (#6)', () => {
  it('does not expose first-time setup or password writes', () => {
    expect(authService.isFirstTimeSetup).toBeUndefined();
    expect(authService.setupAdminPassword).toBeUndefined();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it.each(['./authService.js', './userService.js'])(
    '%s contains no JWT signing code or signing secret',
    (file) => {
      const source = readSource(file);
      expect(source).not.toMatch(/from ['"]jose['"]/);
      expect(source).not.toMatch(/SignJWT|jwtVerify/);
      expect(source).not.toMatch(/VITE_JWT_SECRET|JWT_SECRET/);
      expect(source).not.toMatch(/admin_password_hash/);
    }
  );
});
