/**
 * Simple in-memory rate limiter to prevent abuse of the reservation system
 * For production, consider using a persistent store like Redis
 */

// Store for tracking attempts
const attemptStore = new Map();

// Configuration
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds
const MAX_ATTEMPTS = 5; // Maximum booking attempts per window

/**
 * Check if a user has exceeded their rate limit
 * @param {string} identifier - User identifier (email or IP)
 * @returns {Object} - Rate limit status
 */
export function checkRateLimit(identifier) {
  if (!identifier) {
    return { limited: false }; // No identifier provided, can't rate limit
  }

  const now = Date.now();
  const userAttempts = attemptStore.get(identifier) || { attempts: [], lastReset: now };
  
  // Clean up old attempts outside the window
  const validAttempts = userAttempts.attempts.filter(
    timestamp => now - timestamp < RATE_LIMIT_WINDOW
  );
  
  // Check if we need to reset the window
  if (now - userAttempts.lastReset >= RATE_LIMIT_WINDOW) {
    userAttempts.lastReset = now;
    userAttempts.attempts = [];
  } else {
    userAttempts.attempts = validAttempts;
  }
  
  // Check if user has exceeded the limit
  const isLimited = userAttempts.attempts.length >= MAX_ATTEMPTS;
  
  // Calculate remaining attempts and time until reset
  const remainingAttempts = Math.max(0, MAX_ATTEMPTS - userAttempts.attempts.length);
  const resetTime = userAttempts.lastReset + RATE_LIMIT_WINDOW;
  const timeUntilReset = Math.max(0, resetTime - now);
  
  // Store updated attempts
  attemptStore.set(identifier, userAttempts);
  
  return {
    limited: isLimited,
    remainingAttempts,
    timeUntilReset,
    resetTime
  };
}

/**
 * Record an attempt for rate limiting
 * @param {string} identifier - User identifier (email or IP)
 */
export function recordAttempt(identifier) {
  if (!identifier) return;
  
  const now = Date.now();
  const userAttempts = attemptStore.get(identifier) || { attempts: [], lastReset: now };
  
  // Add current attempt
  userAttempts.attempts.push(now);
  
  // Store updated attempts
  attemptStore.set(identifier, userAttempts);
}

/**
 * Format time until rate limit reset in a human-readable format
 * @param {number} milliseconds - Time in milliseconds
 * @returns {string} - Formatted time
 */
export function formatTimeUntilReset(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  } else {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
}

/**
 * Clear rate limit for a user (for testing or admin override)
 * @param {string} identifier - User identifier (email or IP)
 */
export function clearRateLimit(identifier) {
  if (identifier) {
    attemptStore.delete(identifier);
  }
}
