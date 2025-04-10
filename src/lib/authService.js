import * as jose from 'jose';
import { adminSupabase } from './supabase';

// Secret key for JWT signing - in production, use an environment variable
const JWT_SECRET = import.meta.env.VITE_JWT_SECRET || 'admin-secret-key';

// Store for auth token
const TOKEN_KEY = 'admin_token';

// Settings key for admin password hash in database
const ADMIN_PASSWORD_KEY = 'admin_password_hash';

// Check if admin password has been set up in the database
export async function isFirstTimeSetup() {
  try {
    if (!adminSupabase) {
      console.error('Admin Supabase client not available');
      return true; // Assume first-time setup if no admin client
    }
    
    const { data, error } = await adminSupabase
      .from('settings')
      .select('value')
      .eq('key', ADMIN_PASSWORD_KEY)
      .single();
    
    if (error) {
      console.error('Error checking admin password:', error);
      return true;
    }
    
    // If value is empty string, it means password hasn't been set
    return !data || !data.value;
  } catch (err) {
    console.error('Error in isFirstTimeSetup:', err);
    return true;
  }
}

export async function setupAdminPassword(password) {
  try {
    if (!adminSupabase) {
      console.error('Admin Supabase client not available');
      return false;
    }
    
    // In a real application, use a proper hashing library like bcrypt
    // For this demo, we'll use a simple hash function
    const hashedPassword = hashPassword(password);
    
    // Update the admin password hash in the settings table
    const { error } = await adminSupabase
      .from('settings')
      .update({ value: hashedPassword, updated_at: new Date().toISOString() })
      .eq('key', ADMIN_PASSWORD_KEY);
    
    if (error) {
      console.error('Error setting admin password:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Error in setupAdminPassword:', err);
    return false;
  }
}

export async function loginAdmin(password) {
  try {
    if (!adminSupabase) {
      console.error('Admin Supabase client not available');
      return { success: false, message: 'Admin access not available' };
    }
    
    // Get the stored password hash from the database
    const { data, error } = await adminSupabase
      .from('settings')
      .select('value')
      .eq('key', ADMIN_PASSWORD_KEY)
      .single();
    
    if (error) {
      console.error('Error retrieving admin password:', error);
      return { success: false, message: 'Error retrieving admin credentials' };
    }
    
    if (!data || !data.value) {
      return { success: false, message: 'Admin account not set up' };
    }
    
    const storedHash = data.value;
    const hashedPassword = hashPassword(password);
    
    if (hashedPassword === storedHash) {
      // Generate JWT token using jose library (browser compatible)
      const secret = new TextEncoder().encode(JWT_SECRET);
      const token = await new jose.SignJWT({ role: 'admin' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(secret);
      
      // Store token in localStorage
      localStorage.setItem(TOKEN_KEY, token);
      
      return { success: true, token };
    }
    
    return { success: false, message: 'Invalid password' };
  } catch (err) {
    console.error('Error in loginAdmin:', err);
    return { success: false, message: 'Authentication error' };
  }
}

export function logoutAdmin() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function isAdminAuthenticated() {
  const token = localStorage.getItem(TOKEN_KEY);

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
    console.error('Auth token verification failed:', error.message);
    localStorage.removeItem(TOKEN_KEY);
    return false;
  }
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

// Simple password hashing function (for demo purposes only)
// In production, use a proper hashing library like bcrypt
function hashPassword(password) {
  // This is NOT secure, just for demonstration
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}