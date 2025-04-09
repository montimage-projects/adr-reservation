import { createClient } from '@supabase/supabase-js'
import { generateBookingReference } from './emailService'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Create admin client with service role key for bypassing RLS
export const adminSupabase = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null

// Database helper functions
export async function getAvailableSlots(startDate, endDate) {
  try {
    const { data, error } = await supabase
      .from('slots')
      .select('*')
      .gte('start_time', startDate)
      .lte('end_time', endDate)
      .order('start_time')

    if (error) {
      // If we hit RLS, try using admin client if available
      if (error.code === '42501' && adminSupabase) {
        const { data: adminData, error: adminError } = await adminSupabase
          .from('slots')
          .select('*')
          .gte('start_time', startDate)
          .lte('end_time', endDate)
          .order('start_time')

        if (adminError) throw adminError;
        return adminData;
      } else {
        throw error;
      }
    }

    return data;
  } catch (err) {
    console.error('Error getting available slots:', err);
    throw err;
  }
}

export async function createReservation(slotId, userData) {
  // Check if we have the admin client available for updating slots after reservation
  if (!adminSupabase) {
    throw new Error('Admin access is required to complete reservations. Service key not configured.');
  }

  // Generate a unique booking reference
  const bookingReference = generateBookingReference();
  console.log('Generated booking reference:', bookingReference);

  // Prepare reservation data
  const reservationData = {
    slot_id: slotId,
    user_name: userData.name,
    user_email: userData.email,
    group_id: userData.groupId,
    notes: userData.notes,
    status: 'confirmed',
    reference: bookingReference // Explicitly set the reference
  };

  console.log('Reservation data to be saved:', reservationData);

  try {
    // First create the reservation
    const { data, error } = await adminSupabase
      .from('reservations')
      .insert([reservationData])
      .select('*, slots(*)');

    if (error) {
      console.error('Error creating reservation:', error);
      throw error;
    }

    console.log('Reservation created successfully:', data[0]);

    // After creating a reservation, update the slot's availability
    const { error: updateError } = await adminSupabase
      .from('slots')
      .update({ is_available: false })
      .eq('id', slotId);

    if (updateError) {
      console.error('Error updating slot availability:', updateError);
      throw updateError;
    }

    // Double check the reference is in the returned data
    const reservation = data[0];
    if (!reservation.reference) {
      console.warn('Reference not found in returned data, adding it manually');
      reservation.reference = bookingReference;
    }

    console.log('Final reservation data to be returned:', reservation);
    return reservation;
  } catch (err) {
    console.error('Error in createReservation:', err);
    throw err;
  }
}

export async function getReservations() {
  // This function always needs admin access to get all reservations
  if (!adminSupabase) {
    throw new Error('Admin access is required to view all reservations. Service key not configured.');
  }

  try {
    const { data, error } = await adminSupabase
      .from('reservations')
      .select(`
        *,
        slots (*)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error fetching reservations:', err);
    throw err;
  }
}

/**
 * Subscribe to real-time changes on the slots table
 * @param {function} callback - Function to call when data changes
 * @returns {function} - Unsubscribe function
 */
export function subscribeToSlots(callback) {
  const subscription = supabase
    .channel('public:slots')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'slots' },
      (payload) => {
        callback(payload)
      }
    )
    .subscribe()

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(subscription)
  }
}

/**
 * Resolve booking conflicts by checking if a slot is still available
 * before allowing a booking to proceed
 * @param {string} slotId - The ID of the slot to verify
 * @returns {Promise<boolean>} - Whether the slot is still available
 */
export async function verifySlotAvailability(slotId) {
  try {
    const { data, error } = await supabase
      .from('slots')
      .select('is_available')
      .eq('id', slotId)
      .single()

    if (error) {
      // If we hit RLS, try using admin client if available
      if (error.code === '42501' && adminSupabase) {
        const { data: adminData, error: adminError } = await adminSupabase
          .from('slots')
          .select('is_available')
          .eq('id', slotId)
          .single()

        if (adminError) throw adminError;
        return adminData.is_available;
      } else {
        throw error;
      }
    }

    return data.is_available;
  } catch (err) {
    console.error('Error verifying slot availability:', err);
    throw err;
  }
}

/**
 * Get the closest available slot from the current time
 * @returns {Promise<Object|null>} - The closest available slot or null if none found
 */
export async function getClosestAvailableSlot() {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 1); // Look for slots in the next month

  const { data, error } = await supabase
    .from('slots')
    .select('*')
    .gte('start_time', now.toISOString())
    .lte('start_time', futureDate.toISOString())
    .eq('is_available', true)
    .order('start_time')
    .limit(1);

  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

/**
 * Create test slots in the database for the next 7 days
 * @returns {Promise<Array>} - Array of created slot objects
 */
export async function createTestSlots() {
  // Check if we have the admin client available
  if (!adminSupabase) {
    throw new Error('Admin access is required to create test slots. Service key not configured.');
  }

  const now = new Date();
  const slots = [];

  // Create slots for the next 7 days, one slot per day at 9 AM
  for (let i = 0; i < 7; i++) {
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + i,
      9, // 9 AM
      0, 0, 0
    );

    const endDate = new Date(startDate);
    endDate.setHours(endDate.getHours() + 1); // 1 hour slot

    slots.push({
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      is_available: true
    });
  }

  const { data, error } = await adminSupabase
    .from('slots')
    .insert(slots)
    .select();

  if (error) throw error;
  return data;
}

/**
 * Check if there are any available slots in the database
 * @returns {Promise<boolean>} - Whether any available slots exist
 */
export async function checkSlotsExist() {
  const now = new Date();
  const { count, error } = await supabase
    .from('slots')
    .select('*', { count: 'exact', head: true })
    .gte('start_time', now.toISOString())
    .eq('is_available', true);

  if (error) throw error;
  return count > 0;
}

/**
 * Reset a slot's availability to make it available again (for testing)
 * @param {string} slotId - The ID of the slot to reset
 * @returns {Promise<Object>} - The updated slot
 */
export async function resetSlotAvailability(slotId) {
  // Check if we have the admin client available
  if (!adminSupabase) {
    throw new Error('Admin access is required to reset slot availability. Service key not configured.');
  }

  const { data, error } = await adminSupabase
    .from('slots')
    .update({ is_available: true })
    .eq('id', slotId)
    .select();

  if (error) throw error;
  return data[0];
}

/**
 * Create a new slot
 * @param {Object} slotData - Data for the new slot
 * @returns {Promise<Object>} - The created slot
 */
export async function createSlot(slotData) {
  // Check if we have the admin client available
  if (!adminSupabase) {
    throw new Error('Admin access is required to create slots. Service key not configured.');
  }

  const { data, error } = await adminSupabase
    .from('slots')
    .insert([slotData])
    .select();

  if (error) throw error;
  return data[0];
}

/**
 * Update an existing slot
 * @param {string} slotId - The ID of the slot to update
 * @param {Object} slotData - Updated data for the slot
 * @returns {Promise<Object>} - The updated slot
 */
export async function updateSlot(slotId, slotData) {
  // Check if we have the admin client available
  if (!adminSupabase) {
    throw new Error('Admin access is required to update slots. Service key not configured.');
  }

  const { data, error } = await adminSupabase
    .from('slots')
    .update(slotData)
    .eq('id', slotId)
    .select();

  if (error) throw error;
  return data[0];
}

/**
 * Delete a slot
 * @param {string} slotId - The ID of the slot to delete
 * @returns {Promise<void>}
 */
export async function deleteSlot(slotId) {
  // Check if we have the admin client available
  if (!adminSupabase) {
    throw new Error('Admin access is required to delete slots. Service key not configured.');
  }

  const { error } = await adminSupabase
    .from('slots')
    .delete()
    .eq('id', slotId);

  if (error) throw error;
}

export async function updateReservationStatus(reservationId, status, reason = '') {
  if (!adminSupabase) {
    throw new Error('Admin access is required to update reservation status. Service key not configured.');
  }

  try {
    const { data, error } = await adminSupabase
      .from('reservations')
      .update({
        status,
        status_reason: reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', reservationId)
      .select(`
        *,
        slots (*)
      `);

    if (error) throw error;
    return data[0];
  } catch (err) {
    console.error('Error updating reservation status:', err);
    throw err;
  }
}

export async function deleteReservation(reservationId) {
  if (!adminSupabase) {
    throw new Error('Admin access is required to delete reservations. Service key not configured.');
  }

  try {
    // First get the reservation data for notification
    const { data: reservation, error: fetchError } = await adminSupabase
      .from('reservations')
      .select(`
        *,
        slots (*)
      `)
      .eq('id', reservationId)
      .single();

    if (fetchError) throw fetchError;

    // Delete the reservation
    const { error: deleteError } = await adminSupabase
      .from('reservations')
      .delete()
      .eq('id', reservationId);

    if (deleteError) throw deleteError;

    // Reset slot availability
    if (reservation.slot_id) {
      await resetSlotAvailability(reservation.slot_id);
    }

    return reservation;
  } catch (err) {
    console.error('Error deleting reservation:', err);
    throw err;
  }
}