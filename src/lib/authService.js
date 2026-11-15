import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, getSignedInUser } from './firebase';

// Admin authentication (docs/auth-model.md).
//
// Firebase Auth verifies the admin's email and password and stores the
// password hash; nothing is hashed, signed or stored by this app. A signed-in
// user is an admin only when the document `admins/{uid}` exists. Admins are
// created in the Firebase console, so there is no in-app password setup.
// Firestore rules enforce admin access with the same check; the UI check
// below only decides what to show.

const LOGIN_FAILED = 'Invalid email or password';
const NOT_ADMIN = 'This account does not have administrator access';

const CREDENTIAL_ERRORS = new Set([
  'auth/invalid-credential',
  'auth/invalid-email',
  'auth/invalid-login-credentials',
  'auth/user-disabled',
  'auth/user-not-found',
  'auth/wrong-password',
]);

/**
 * Whether `user` is a non-anonymous Firebase user with an `admins/{uid}` doc.
 * Throws if the admin document cannot be read.
 */
async function hasAdminDoc(user) {
  if (!user || user.isAnonymous) {
    return false;
  }
  const adminSnap = await getDoc(doc(db, 'admins', user.uid));
  return adminSnap.exists();
}

/**
 * Sign an admin in with Firebase Auth email/password.
 * @returns {Promise<{success: boolean, message?: string}>}
 */
export async function loginAdmin(email, password) {
  let user;
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    user = credential.user;
  } catch (error) {
    if (CREDENTIAL_ERRORS.has(error.code)) {
      return { success: false, message: LOGIN_FAILED };
    }
    if (error.code === 'auth/too-many-requests') {
      return { success: false, message: 'Too many attempts. Please try again later.' };
    }
    console.error('Admin sign-in failed:', error.code || error.message);
    return { success: false, message: 'Authentication error' };
  }

  let isAdmin = false;
  try {
    isAdmin = await hasAdminDoc(user);
  } catch (error) {
    console.error('Admin check failed:', error.code || error.message);
  }

  if (!isAdmin) {
    // Do not keep a non-admin email/password session around.
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign-out after failed admin check failed:', error.code || error.message);
    }
    return { success: false, message: NOT_ADMIN };
  }

  return { success: true };
}

export async function logoutAdmin() {
  await signOut(auth);
}

/**
 * Whether the current Firebase user is an admin. Waits for a persisted session
 * to be restored, so a page reload does not log the admin out.
 */
export async function isAdminAuthenticated() {
  try {
    const user = await getSignedInUser();
    return await hasAdminDoc(user);
  } catch (error) {
    console.error('Admin check failed:', error.code || error.message);
    return false;
  }
}
