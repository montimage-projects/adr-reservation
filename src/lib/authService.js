import * as jose from 'jose';

// Secret key for JWT signing - in production, use an environment variable
const JWT_SECRET = import.meta.env.VITE_JWT_SECRET || 'admin-secret-key';

// Store for first-time setup state
const AUTH_STATE_KEY = 'admin_auth_state';
const TOKEN_KEY = 'admin_token';
const ADMIN_PASSWORD_KEY = 'admin_password_hash';

// For simplicity, we're storing the password hash in localStorage
// In a real app, this would be stored in a database
export function isFirstTimeSetup() {
  return !localStorage.getItem(ADMIN_PASSWORD_KEY);
}

export function setupAdminPassword(password) {
  // In a real application, use a proper hashing library like bcrypt
  // For this demo, we'll use a simple hash function
  const hashedPassword = hashPassword(password);
  localStorage.setItem(ADMIN_PASSWORD_KEY, hashedPassword);
  localStorage.setItem(AUTH_STATE_KEY, 'setup_complete');
  return true;
}

export async function loginAdmin(password) {
  const storedHash = localStorage.getItem(ADMIN_PASSWORD_KEY);

  if (!storedHash) {
    return { success: false, message: 'Admin account not set up' };
  }

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