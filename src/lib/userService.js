import { auth, db, getSignedInUser } from './firebase';
import { signInAnonymously } from 'firebase/auth';
import { collection, doc, getDoc, setDoc, updateDoc, query, where, getDocs, orderBy, deleteDoc } from 'firebase/firestore';
import { sendCancellationEmail } from './emailService';

// Visitor sessions (docs/auth-model.md). The visitor's identity is their
// Firebase Auth user, normally an anonymous one (see startAnonymousSession in
// ./firebase). Entering a name and email only saves profile details; nothing
// is signed in the browser.

// Storage keys
const USER_SESSION_KEY = 'user_session_uid'; // uid that entered the details
const USER_DATA_KEY = 'userData'; // Profile details, kept to prefill bookings
const LEGACY_USER_TOKEN_KEY = 'user_token'; // Old browser-signed token

/**
 * Return the current Firebase user, signing in anonymously when there is none.
 * @returns {Promise<import('firebase/auth').User>}
 */
async function ensureSignedIn() {
  const user = await getSignedInUser();
  if (user) {
    return user;
  }
  const credential = await signInAnonymously(auth);
  return credential.user;
}

/**
 * Register a new user or update an existing one. The profile lives at
 * users/{uid} of the visitor's Firebase user (docs/auth-model.md).
 * @param {Object} userData - User data object
 * @returns {Promise<Object>} - User data with success flag
 */
export async function registerUser(userData) {
  try {
    // Firestore requests need a Firebase identity.
    const user = await ensureSignedIn();

    // Normalize email to lowercase
    const email = userData.email.toLowerCase();

    const userRef = doc(db, 'users', user.uid);
    const existing = await getDoc(userRef);
    const isNewUser = !existing.exists();

    // The keys must match profileFields() in firestore.rules.
    const now = new Date().toISOString();
    const profile = {
      name: userData.name,
      email,
      group_id: userData.groupId ?? '',
      updated_at: now
    };
    if (isNewUser) {
      profile.created_at = now;
    }
    await setDoc(userRef, profile, { merge: true });

    // Remember the details and which Firebase user entered them
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
    localStorage.setItem(USER_SESSION_KEY, user.uid);
    localStorage.removeItem(LEGACY_USER_TOKEN_KEY);

    return {
      success: true,
      userData,
      userId: user.uid,
      isNewUser
    };
  } catch (error) {
    console.error('Error registering user:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get the signed-in visitor's reservation history, newest first. Only
 * reservations made by this Firebase user are readable (docs/auth-model.md).
 * @returns {Promise<Object>} - User reservations
 */
export async function getUserReservations() {
  try {
    const user = await getSignedInUser();
    if (!user) {
      return { success: true, reservations: [] };
    }

    const reservationsRef = collection(db, 'reservations');
    const q = query(
      reservationsRef, 
      where('user_uid', '==', user.uid),
      orderBy('created_at', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return { success: true, reservations: [] };
    }
    
    const reservations = [];
    const slotPromises = [];
    
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const reservation = {
        id: docSnap.id,
        ...data,
        created_at: data.created_at ? new Date(data.created_at.seconds * 1000) : null,
        updated_at: data.updated_at ? new Date(data.updated_at.seconds * 1000) : null
      };
      
      // Get the associated slot data
      if (data.slot_id) {
        const slotPromise = getDoc(doc(db, 'slots', data.slot_id))
          .then(slotSnap => {
            if (slotSnap.exists()) {
              const slotData = slotSnap.data();
              reservation.slots = {
                id: slotSnap.id,
                ...slotData,
                start_time: slotData.start_time ? new Date(slotData.start_time.seconds * 1000) : null,
                end_time: slotData.end_time ? new Date(slotData.end_time.seconds * 1000) : null,
                created_at: slotData.created_at ? new Date(slotData.created_at.seconds * 1000) : null
              };
            }
            return reservation;
          });
        
        slotPromises.push(slotPromise);
      }
      
      reservations.push(reservation);
    });
    
    await Promise.all(slotPromises);
    
    // Log reservation data for debugging
    console.log('Retrieved reservations:', reservations);
    
    return { success: true, reservations };
  } catch (error) {
    console.error('Error getting user reservations:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get current logged in user from localStorage
 * @returns {Object|null} - User data or null if not found
 */
export function getCurrentUser() {
  try {
    const userData = localStorage.getItem(USER_DATA_KEY);
    return userData ? JSON.parse(userData) : null;
  } catch (error) {
    console.error('Error parsing user data:', error);
    return null;
  }
}

/**
 * Check if the visitor has an active session: a Firebase user is signed in
 * and that same user entered their details on this browser.
 * @returns {Promise<boolean>} - Whether user is authenticated
 */
export async function isUserAuthenticated() {
  try {
    const user = await getSignedInUser();
    return Boolean(
      user &&
      localStorage.getItem(USER_SESSION_KEY) === user.uid &&
      getCurrentUser()
    );
  } catch (error) {
    console.error('Error checking user session:', error.code || error.message);
    return false;
  }
}

/**
 * Log out current user. The anonymous Firebase user is kept, so the visitor's
 * identity (and anything linked to it) survives logging back in.
 */
export function logoutUser() {
  localStorage.removeItem(USER_SESSION_KEY);
  localStorage.removeItem(LEGACY_USER_TOKEN_KEY);
  // Keep USER_DATA_KEY for convenience when booking again
}

export async function cancelReservation(reservationId, cancellationReason = 'User requested cancellation') {
  try {
    // First get the reservation data to get the slot_id
    const reservationRef = doc(db, 'reservations', reservationId);
    const reservationSnap = await getDoc(reservationRef);
    
    if (!reservationSnap.exists()) {
      console.error('Reservation not found');
      return { success: false, error: 'Reservation not found' };
    }
    
    const reservation = reservationSnap.data();
    let slotData = null;
    
    // Get the slot data
    if (reservation.slot_id) {
      const slotRef = doc(db, 'slots', reservation.slot_id);
      const slotSnap = await getDoc(slotRef);
      
      if (slotSnap.exists()) {
        slotData = slotSnap.data();
        slotData.id = slotSnap.id;
      }
    }
    
    // Delete the reservation
    await deleteDoc(reservationRef);
    
    // Reset the slot availability
    if (reservation.slot_id) {
      const slotRef = doc(db, 'slots', reservation.slot_id);
      await updateDoc(slotRef, { is_available: true });
    }
    
    // Send cancellation email
    if (reservation) {
      console.log('Sending cancellation email for reservation:', reservation);
      await sendCancellationEmail({
        userData: {
          name: reservation.user_name,
          email: reservation.user_email,
          groupId: reservation.group_id
        },
        slot: slotData ? {
          ...slotData,
          start_time: slotData.start_time ? new Date(slotData.start_time.seconds * 1000) : null,
          end_time: slotData.end_time ? new Date(slotData.end_time.seconds * 1000) : null
        } : null,
        reference: reservation.reference,
        cancellationReason: cancellationReason // This will be passed as 'reason' to the template
      });
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error cancelling reservation:', error);
    return { success: false, error: error.message };
  }
}