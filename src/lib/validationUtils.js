/**
 * Validation utilities for user input
 */

/**
 * Validate an email address
 * @param {string} email - Email address to validate
 * @returns {Object} Validation result with success flag and optional error message
 */
export function validateEmail(email) {
  if (!email || email.trim() === '') {
    return { success: false, error: 'Email is required', field: 'email' };
  }
  
  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { success: false, error: 'Please enter a valid email address', field: 'email' };
  }
  
  return { success: true };
}

/**
 * Validate a name
 * @param {string} name - Name to validate
 * @returns {Object} Validation result with success flag and optional error message
 */
export function validateName(name) {
  if (!name || name.trim() === '') {
    return { success: false, error: 'Name is required', field: 'name' };
  }
  
  // Name should be at least 2 characters
  if (name.trim().length < 2) {
    return { success: false, error: 'Name must be at least 2 characters', field: 'name' };
  }
  
  // Name should not contain special characters except for spaces, hyphens, and apostrophes
  const nameRegex = /^[a-zA-Z\s'-]+$/;
  if (!nameRegex.test(name)) {
    return { success: false, error: 'Name contains invalid characters', field: 'name' };
  }
  
  return { success: true };
}

/**
 * Validate a group ID
 * @param {string} groupId - Group ID to validate
 * @returns {Object} Validation result with success flag and optional error message
 */
export function validateGroupId(groupId) {
  if (!groupId || groupId.trim() === '') {
    return { success: true }; // Group ID is optional
  }
  
  // Group ID should be alphanumeric with optional hyphens and underscores
  const groupIdRegex = /^[a-zA-Z0-9_-]+$/;
  if (!groupIdRegex.test(groupId)) {
    return { success: false, error: 'Group ID contains invalid characters', field: 'groupId' };
  }
  
  return { success: true };
}

/**
 * Validate notes
 * @param {string} notes - Notes to validate
 * @returns {Object} Validation result with success flag and optional error message
 */
export function validateNotes(notes) {
  if (!notes || notes.trim() === '') {
    return { success: true }; // Notes are optional
  }
  
  // Notes should not be too long (limit to 500 characters)
  if (notes.length > 500) {
    return { success: false, error: 'Notes must be less than 500 characters', field: 'notes' };
  }
  
  return { success: true };
}

/**
 * Validate all booking form data
 * @param {Object} formData - Form data to validate
 * @returns {Object} Validation result with success flag and optional error message
 */
export function validateBookingForm(formData) {
  const emailValidation = validateEmail(formData.email);
  if (!emailValidation.success) {
    return emailValidation;
  }
  
  const nameValidation = validateName(formData.name);
  if (!nameValidation.success) {
    return nameValidation;
  }
  
  const groupIdValidation = validateGroupId(formData.groupId);
  if (!groupIdValidation.success) {
    return groupIdValidation;
  }
  
  const notesValidation = validateNotes(formData.notes);
  if (!notesValidation.success) {
    return notesValidation;
  }
  
  return { success: true };
}
