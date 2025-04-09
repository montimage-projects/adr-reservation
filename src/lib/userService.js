import { supabase, adminSupabase } from './supabase';
import * as jose from 'jose';

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
    // Check if we have the admin client available
    if (!adminSupabase) {
      throw new Error('Admin access is required to register users. Service key not configured.');
    }

    // Check if user already exists
    const { data: existingUser, error: checkError } = await adminSupabase
      .from('users')
      .select('*')
      .eq('email', userData.email)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      // Error other than "not found"
      throw checkError;
    }

    let userId;
    if (existingUser) {
      // Update existing user
      const { error } = await adminSupabase
        .from('users')
        .update({
          name: userData.name,
          group_id: userData.groupId,
          // Don't update email as it's the primary identifier
        })
        .eq('id', existingUser.id)
        .select();

      if (error) throw error;
      userId = existingUser.id;
    } else {
      // Create new user
      const { data, error } = await adminSupabase
        .from('users')
        .insert([
          {
            name: userData.name,
            email: userData.email,
            group_id: userData.groupId,
          }
        ])
        .select();

      if (error) throw error;
      userId = data[0].id;
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
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      // If hit RLS issue, try using admin client
      if (error.code === '42501' && adminSupabase) {
        const { data: adminData, error: adminError } = await adminSupabase
          .from('users')
          .select('*')
          .eq('email', email)
          .single();

        if (adminError) throw adminError;
        return { success: true, userData: adminData };
      } else {
        throw error;
      }
    }

    return { success: true, userData: data };
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
    // Always try to use adminSupabase for better data access
    if (adminSupabase) {
      const { data, error } = await adminSupabase
        .from('reservations')
        .select(`
          *,
          slots (*)
        `)
        .eq('user_email', email)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Log reservation data for debugging
      console.log('Retrieved reservations:', data);

      return { success: true, reservations: data };
    }

    // Fallback to regular client if admin is not available
    const { data, error } = await supabase
      .from('reservations')
      .select(`
        *,
        slots (*)
      `)
      .eq('user_email', email)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return { success: true, reservations: data };
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

export async function cancelReservation(reservationId) {
  try {
    const { data, error } = await supabase
      .from('reservations')
      .delete()
      .eq('id', reservationId);

    if (error) {
      console.error('Error cancelling reservation:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error cancelling reservation:', error);
    return { success: false, error: error.message };
  }
}