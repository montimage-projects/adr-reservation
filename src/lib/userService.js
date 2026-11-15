import { db } from './firebase';
import { collection, doc, getDoc, updateDoc, query, where, getDocs, orderBy, addDoc, deleteDoc } from 'firebase/firestore';
import * as jose from 'jose';
import { sendCancellationEmail } from './emailService';

// Secret key for JWT signing - in production, use an environment variable
const JWT_SECRET = import.meta.env.VITE_JWT_SECRET || 'user-secret-key';

// Storage keys
const USER_TOKEN_KEY = 'user_token';
const USER_DATA_KEY = 'userData'; // Keep this for backward compatibility

/**
 * Register a new user or update an existing one
 * @param {Object} userData - User data object
 * @returns {Promise<Object>} - User data with success flag
 */
export async function registerUser(userData) {
  try {
    // Normalize email to lowercase
    const email = userData.email.toLowerCase();
    
    // Check if user already exists
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const querySnapshot = await getDocs(q);
    
    let userId;
    let existingUser = null;
    
    if (!querySnapshot.empty) {
      // User exists, update them
      existingUser = querySnapshot.docs[0];
      userId = existingUser.id;
      
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        name: userData.name,
        group_id: userData.groupId,
        // Don't update email as it's the primary identifier
        updated_at: new Date().toISOString()
      });
    } else {
      // Create new user
      const newUser = {
        name: userData.name,
        email: email,
        group_id: userData.groupId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const docRef = await addDoc(usersRef, newUser);
      userId = docRef.id;
    }

    // Store in localStorage for convenience (more secure would be HTTP-only cookies)
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));

    // Generate a token for the user
    const token = await generateUserToken(userData, userId);

    return {
      success: true,
      userData,
      token,
      userId,
      isNewUser: !existingUser
    };
  } catch (error) {
    console.error('Error registering user:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get user information by email
 * @param {string} email - User email
 * @returns {Promise<Object>} - User data
 */
export async function getUserByEmail(email) {
  try {
    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase();
    
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', normalizedEmail));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return { success: false, error: 'User not found' };
    }
    
    const userData = querySnapshot.docs[0].data();
    userData.id = querySnapshot.docs[0].id; // Add the document ID
    
    return { success: true, userData };
  } catch (error) {
    console.error('Error getting user:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get user reservations history
 * @param {string} email - User email
 * @returns {Promise<Object>} - User reservations
 */
export async function getUserReservations(email) {
  try {
    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase();
    
    const reservationsRef = collection(db, 'reservations');
    const q = query(
      reservationsRef, 
      where('user_email', '==', normalizedEmail),
      orderBy('created_at', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return { success: true, reservations: [] };
    }
    
    const reservations = [];
    const slotPromises = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const reservation = {
        id: doc.id,
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
 * Check if user has an active session
 * @returns {Promise<boolean>} - Whether user is authenticated
 */
export async function isUserAuthenticated() {
  const token = localStorage.getItem(USER_TOKEN_KEY);

  if (!token) {
    return false;
  }

  try {
    // Verify token using jose library
    const secret = new TextEncoder().encode(JWT_SECRET);
    await jose.jwtVerify(token, secret);
    return true;
  } catch (error) {
    // Token is invalid or expired
    console.error('User token verification failed:', error.message);
    localStorage.removeItem(USER_TOKEN_KEY);
    return false;
  }
}

/**
 * Log out current user
 */
export function logoutUser() {
  localStorage.removeItem(USER_TOKEN_KEY);
  // Keep USER_DATA_KEY for convenience when booking again
}

/**
 * Generate JWT token for user
 * @param {Object} userData - User data
 * @param {string} userId - User ID
 * @returns {Promise<string>} - JWT token
 */
async function generateUserToken(userData, userId) {
  // Generate JWT token
  const secret = new TextEncoder().encode(JWT_SECRET);
  const token = await new jose.SignJWT({
    role: 'user',
    id: userId,
    email: userData.email,
    name: userData.name
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d') // Longer expiration for regular users
    .sign(secret);

  // Store token in localStorage
  localStorage.setItem(USER_TOKEN_KEY, token);

  return token;
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