// Firebase configuration
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp, onSnapshot, limit, Timestamp, getCountFromServer } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { generateBookingReference } from './emailService';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Helper function to convert Firestore timestamp to Date
const fromFirestoreTimestamp = (timestamp) => {
  return timestamp ? timestamp.toDate() : null;
};

// Helper function to convert Date to Firestore timestamp
const toFirestoreTimestamp = (date) => {
  return date ? Timestamp.fromDate(new Date(date)) : null;
};

// Database helper functions
export async function getAvailableSlots(startDate, endDate) {
  try {
    const slotsRef = collection(db, 'slots');
    const q = query(
      slotsRef,
      where('start_time', '>=', toFirestoreTimestamp(startDate)),
      where('start_time', '<=', toFirestoreTimestamp(endDate)),
      where('is_available', '==', true),
      orderBy('start_time')
    );

    const querySnapshot = await getDocs(q);
    const slots = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      slots.push({
        id: doc.id,
        start_time: fromFirestoreTimestamp(data.start_time),
        end_time: fromFirestoreTimestamp(data.end_time),
        is_available: data.is_available,
        created_at: fromFirestoreTimestamp(data.created_at)
      });
    });

    return slots;
  } catch (err) {
    console.error('Error getting available slots:', err);
    throw err;
  }
}

export async function createReservation(slotId, userData) {
  try {
    // Generate a unique booking reference
    const bookingReference = generateBookingReference();
    console.log('Generated booking reference:', bookingReference);

    // First verify the slot is still available
    const slotRef = doc(db, 'slots', slotId);
    const slotSnap = await getDoc(slotRef);
    
    if (!slotSnap.exists()) {
      throw new Error('Slot not found');
    }
    
    const slotData = slotSnap.data();
    if (!slotData.is_available) {
      throw new Error('Slot is no longer available');
    }
    
    // Prepare reservation data
    const reservationData = {
      slot_id: slotId,
      user_name: userData.name,
      user_email: userData.email,
      group_id: userData.groupId,
      notes: userData.notes,
      status: 'confirmed',
      reference: bookingReference,
      created_at: serverTimestamp()
    };

    console.log('Reservation data to be saved:', reservationData);

    // Create the reservation in Firestore
    const reservationsRef = collection(db, 'reservations');
    const newReservationRef = await addDoc(reservationsRef, reservationData);
    
    // Update the slot's availability
    await updateDoc(slotRef, {
      is_available: false
    });
    
    // Get the slot data to return with the reservation
    const reservation = {
      id: newReservationRef.id,
      ...reservationData,
      slots: {
        id: slotSnap.id,
        ...slotData,
        start_time: fromFirestoreTimestamp(slotData.start_time),
        end_time: fromFirestoreTimestamp(slotData.end_time),
        created_at: fromFirestoreTimestamp(slotData.created_at)
      }
    };
    
    console.log('Final reservation data to be returned:', reservation);
    return reservation;
  } catch (err) {
    console.error('Error in createReservation:', err);
    throw err;
  }
}

export async function getReservations() {
  try {
    const reservationsRef = collection(db, 'reservations');
    const q = query(reservationsRef, orderBy('created_at', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const reservations = [];
    const slotPromises = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const reservation = {
        id: doc.id,
        ...data,
        created_at: fromFirestoreTimestamp(data.created_at),
        updated_at: fromFirestoreTimestamp(data.updated_at)
      };
      
      // Get the associated slot data
      const slotPromise = getDoc(doc(db, 'slots', data.slot_id))
        .then(slotSnap => {
          if (slotSnap.exists()) {
            const slotData = slotSnap.data();
            reservation.slots = {
              id: slotSnap.id,
              ...slotData,
              start_time: fromFirestoreTimestamp(slotData.start_time),
              end_time: fromFirestoreTimestamp(slotData.end_time),
              created_at: fromFirestoreTimestamp(slotData.created_at)
            };
          }
          return reservation;
        });
      
      slotPromises.push(slotPromise);
      reservations.push(reservation);
    });
    
    await Promise.all(slotPromises);
    return reservations;
  } catch (err) {
    console.error('Error fetching reservations:', err);
    throw err;
  }
}

export function subscribeToSlots(callback) {
  try {
    const slotsRef = collection(db, 'slots');
    const q = query(slotsRef, where('is_available', '==', true), orderBy('start_time'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const slots = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        slots.push({
          id: doc.id,
          ...data,
          start_time: fromFirestoreTimestamp(data.start_time),
          end_time: fromFirestoreTimestamp(data.end_time),
          created_at: fromFirestoreTimestamp(data.created_at)
        });
      });
      
      callback(slots);
    }, (error) => {
      console.error('Error subscribing to slots:', error);
    });
    
    return unsubscribe;
  } catch (err) {
    console.error('Error setting up subscription:', err);
    throw err;
  }
}

export async function verifySlotAvailability(slotId) {
  try {
    const slotRef = doc(db, 'slots', slotId);
    const slotSnap = await getDoc(slotRef);
    
    if (!slotSnap.exists()) {
      return false;
    }
    
    return slotSnap.data().is_available;
  } catch (err) {
    console.error('Error verifying slot availability:', err);
    throw err;
  }
}

export async function getClosestAvailableSlot() {
  try {
    const now = new Date();
    const slotsRef = collection(db, 'slots');
    const q = query(
      slotsRef,
      where('start_time', '>=', toFirestoreTimestamp(now)),
      where('is_available', '==', true),
      orderBy('start_time'),
      limit(1)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    const doc = querySnapshot.docs[0];
    const data = doc.data();
    
    return {
      id: doc.id,
      ...data,
      start_time: fromFirestoreTimestamp(data.start_time),
      end_time: fromFirestoreTimestamp(data.end_time),
      created_at: fromFirestoreTimestamp(data.created_at)
    };
  } catch (err) {
    console.error('Error getting closest available slot:', err);
    throw err;
  }
}

// Count future slots that are still bookable (uses the is_available + start_time index)
export async function getAvailableSlotsCount() {
  try {
    const q = query(
      collection(db, 'slots'),
      where('start_time', '>=', toFirestoreTimestamp(new Date())),
      where('is_available', '==', true)
    );
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  } catch (err) {
    console.error('Error counting available slots:', err);
    throw err;
  }
}

export async function createTestSlots() {
  try {
    const now = new Date();
    const slots = [];
    
    // Create slots for the next 7 days
    for (let i = 0; i < 7; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);
      date.setHours(9, 0, 0, 0); // 9 AM
      
      // Create 4 slots per day (9 AM, 11 AM, 1 PM, 3 PM)
      for (let j = 0; j < 4; j++) {
        const startTime = new Date(date);
        startTime.setHours(9 + (j * 2), 0, 0, 0);
        
        const endTime = new Date(startTime);
        endTime.setHours(startTime.getHours() + 1, 30, 0, 0); // 1.5 hour slots
        
        const slotData = {
          start_time: toFirestoreTimestamp(startTime),
          end_time: toFirestoreTimestamp(endTime),
          is_available: true,
          created_at: serverTimestamp()
        };
        
        const slotsRef = collection(db, 'slots');
        const newSlotRef = await addDoc(slotsRef, slotData);
        
        slots.push({
          id: newSlotRef.id,
          ...slotData,
          start_time: startTime,
          end_time: endTime
        });
      }
    }
    
    return slots;
  } catch (err) {
    console.error('Error creating test slots:', err);
    throw err;
  }
}

export async function checkSlotsExist() {
  try {
    const slotsRef = collection(db, 'slots');
    const q = query(slotsRef, limit(1));
    const querySnapshot = await getDocs(q);
    
    return !querySnapshot.empty;
  } catch (err) {
    console.error('Error checking if slots exist:', err);
    throw err;
  }
}

export async function resetSlotAvailability(slotId) {
  try {
    const slotRef = doc(db, 'slots', slotId);
    await updateDoc(slotRef, {
      is_available: true
    });
    
    const slotSnap = await getDoc(slotRef);
    const data = slotSnap.data();
    
    return {
      id: slotSnap.id,
      ...data,
      start_time: fromFirestoreTimestamp(data.start_time),
      end_time: fromFirestoreTimestamp(data.end_time),
      created_at: fromFirestoreTimestamp(data.created_at)
    };
  } catch (err) {
    console.error('Error resetting slot availability:', err);
    throw err;
  }
}

export async function createSlot(slotData) {
  try {
    const newSlot = {
      start_time: toFirestoreTimestamp(slotData.start_time),
      end_time: toFirestoreTimestamp(slotData.end_time),
      is_available: true,
      created_at: serverTimestamp()
    };
    
    const slotsRef = collection(db, 'slots');
    const newSlotRef = await addDoc(slotsRef, newSlot);
    
    return {
      id: newSlotRef.id,
      ...newSlot,
      start_time: slotData.start_time,
      end_time: slotData.end_time
    };
  } catch (err) {
    console.error('Error creating slot:', err);
    throw err;
  }
}

export async function updateSlot(slotId, slotData) {
  try {
    const slotRef = doc(db, 'slots', slotId);
    
    const updatedData = {
      start_time: toFirestoreTimestamp(slotData.start_time),
      end_time: toFirestoreTimestamp(slotData.end_time)
    };
    
    await updateDoc(slotRef, updatedData);
    
    const slotSnap = await getDoc(slotRef);
    const data = slotSnap.data();
    
    return {
      id: slotSnap.id,
      ...data,
      start_time: fromFirestoreTimestamp(data.start_time),
      end_time: fromFirestoreTimestamp(data.end_time),
      created_at: fromFirestoreTimestamp(data.created_at)
    };
  } catch (err) {
    console.error('Error updating slot:', err);
    throw err;
  }
}

export async function deleteSlot(slotId) {
  try {
    // Check if there are any reservations for this slot
    const reservationsRef = collection(db, 'reservations');
    const q = query(reservationsRef, where('slot_id', '==', slotId));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      throw new Error('Cannot delete slot with existing reservations');
    }
    
    const slotRef = doc(db, 'slots', slotId);
    await deleteDoc(slotRef);
  } catch (err) {
    console.error('Error deleting slot:', err);
    throw err;
  }
}

export async function updateReservationStatus(reservationId, status, reason = '') {
  try {
    const reservationRef = doc(db, 'reservations', reservationId);
    
    await updateDoc(reservationRef, {
      status,
      status_reason: reason,
      updated_at: serverTimestamp()
    });
    
    const reservationSnap = await getDoc(reservationRef);
    if (!reservationSnap.exists()) {
      throw new Error('Reservation not found');
    }
    
    const data = reservationSnap.data();
    
    // Get the associated slot
    const slotRef = doc(db, 'slots', data.slot_id);
    const slotSnap = await getDoc(slotRef);
    
    const slotData = slotSnap.exists() ? slotSnap.data() : null;
    
    return {
      id: reservationSnap.id,
      ...data,
      created_at: fromFirestoreTimestamp(data.created_at),
      updated_at: fromFirestoreTimestamp(data.updated_at),
      slots: slotData ? {
        id: slotSnap.id,
        ...slotData,
        start_time: fromFirestoreTimestamp(slotData.start_time),
        end_time: fromFirestoreTimestamp(slotData.end_time),
        created_at: fromFirestoreTimestamp(slotData.created_at)
      } : null
    };
  } catch (err) {
    console.error('Error updating reservation status:', err);
    throw err;
  }
}

export async function deleteReservation(reservationId) {
  try {
    // First get the reservation data for notification
    const reservationRef = doc(db, 'reservations', reservationId);
    const reservationSnap = await getDoc(reservationRef);
    
    if (!reservationSnap.exists()) {
      throw new Error('Reservation not found');
    }
    
    const data = reservationSnap.data();
    
    // Get the associated slot
    const slotRef = doc(db, 'slots', data.slot_id);
    const slotSnap = await getDoc(slotRef);
    
    const slotData = slotSnap.exists() ? slotSnap.data() : null;
    
    // Delete the reservation
    await deleteDoc(reservationRef);
    
    // Reset slot availability
    if (data.slot_id) {
      await resetSlotAvailability(data.slot_id);
    }
    
    return {
      id: reservationSnap.id,
      ...data,
      created_at: fromFirestoreTimestamp(data.created_at),
      updated_at: fromFirestoreTimestamp(data.updated_at),
      slots: slotData ? {
        id: slotSnap.id,
        ...slotData,
        start_time: fromFirestoreTimestamp(slotData.start_time),
        end_time: fromFirestoreTimestamp(slotData.end_time),
        created_at: fromFirestoreTimestamp(slotData.created_at)
      } : null
    };
  } catch (err) {
    console.error('Error deleting reservation:', err);
    throw err;
  }
}

export async function getUserReservationCount(email) {
  if (!email) {
    return { success: false, error: 'Email is required to check reservation count' };
  }

  try {
    // Get current date in ISO format for comparison
    const now = new Date();
    
    // Query reservations for this user
    const reservationsRef = collection(db, 'reservations');
    const q = query(
      reservationsRef,
      where('user_email', '==', email.toLowerCase()),
      where('status', '==', 'confirmed')
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return { success: true, count: 0, reservations: [] };
    }
    
    const reservations = [];
    const slotPromises = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const reservation = {
        id: doc.id,
        ...data,
        created_at: fromFirestoreTimestamp(data.created_at),
        updated_at: fromFirestoreTimestamp(data.updated_at)
      };
      
      // Get the associated slot data
      const slotPromise = getDoc(doc(db, 'slots', data.slot_id))
        .then(slotSnap => {
          if (slotSnap.exists()) {
            const slotData = slotSnap.data();
            reservation.slots = {
              id: slotSnap.id,
              ...slotData,
              start_time: fromFirestoreTimestamp(slotData.start_time),
              end_time: fromFirestoreTimestamp(slotData.end_time),
              created_at: fromFirestoreTimestamp(slotData.created_at)
            };
          }
          return reservation;
        });
      
      slotPromises.push(slotPromise);
      reservations.push(reservation);
    });
    
    await Promise.all(slotPromises);
    
    // Filter to only include reservations with future slots
    const activeReservations = reservations.filter(reservation => {
      // Skip if no slot data
      if (!reservation.slots) return false;
      
      // Check if the slot is in the future
      return reservation.slots.start_time > now;
    });
    
    console.log('Active future reservations for email', email, ':', activeReservations);

    return { 
      success: true, 
      count: activeReservations.length,
      reservations: activeReservations 
    };
  } catch (err) {
    console.error('Error in getUserReservationCount:', err);
    return { success: false, error: err.message };
  }
}

// Authentication functions
export async function signIn(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { user: userCredential.user, success: true };
  } catch (error) {
    console.error('Error signing in:', error);
    return { error: error.message, success: false };
  }
}

export async function logOut() {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    console.error('Error signing out:', error);
    return { error: error.message, success: false };
  }
}

// Export Firebase instances for direct access if needed
export { db, auth };
