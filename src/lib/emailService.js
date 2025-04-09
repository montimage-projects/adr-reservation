import emailjs from '@emailjs/browser';

// Email.js service configuration (replace with your own credentials)
const EMAIL_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || 'service_default';
const EMAIL_CONFIRMATION_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_CONFIRMATION_TEMPLATE_ID || 'template_default';
const EMAIL_CANCELLATION_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_CANCELLATION_TEMPLATE_ID || 'template_cancellation';
const EMAIL_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || '';

/**
 * Initialize Email.js
 * Should be called at application startup
 */
export function initEmailService() {
  if (EMAIL_PUBLIC_KEY) {
    emailjs.init(EMAIL_PUBLIC_KEY);
    console.log('Email service initialized');
    return true;
  } else {
    console.warn('Email service not initialized: Missing public key');
    return false;
  }
}

/**
 * Generate a unique booking reference number
 * @returns {string} - Unique booking reference
 */
export function generateBookingReference() {
  // Create a unique reference with format: ADR-YYYYMMDD-XXXX
  const now = new Date();
  const datePart = now.getFullYear().toString() +
                  (now.getMonth() + 1).toString().padStart(2, '0') +
                  now.getDate().toString().padStart(2, '0');

  // Add random 4 character alphanumeric suffix
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return `ADR-${datePart}-${suffix}`;
}

/**
 * Format date and time from slot data consistently
 * @param {Object} slot - Slot object with date/time information
 * @returns {Object} - Formatted date, time and duration
 */
function formatSlotDateTime(slot) {
  let formattedDate = 'Date not available';
  let formattedTime = 'Time not available';
  let duration = 'Duration not specified';

  try {
    if (!slot) return { formattedDate, formattedTime, duration };

    // Parse date from slot - handle different formats
    let bookingDate;
    
    if (slot.date && slot.start_time) {
      // Format 1: separate date and time fields
      bookingDate = new Date(`${slot.date} ${slot.start_time}`);
    } else if (slot.start_time && typeof slot.start_time === 'string' && slot.start_time.includes('T')) {
      // Format 2: ISO string in start_time
      bookingDate = new Date(slot.start_time);
    } else if (slot.start_time) {
      // Format 3: just a time string, use current date
      const today = new Date().toISOString().split('T')[0];
      bookingDate = new Date(`${today}T${slot.start_time}`);
    }

    // Format date and time if we have a valid date
    if (bookingDate && !isNaN(bookingDate.getTime())) {
      formattedDate = bookingDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      formattedTime = bookingDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    }

    // Handle duration calculation
    if (slot.duration) {
      duration = `${slot.duration} minutes`;
    } else if (slot.end_time && slot.start_time) {
      // Calculate duration from start and end times
      const start = new Date(slot.start_time);
      const end = new Date(slot.end_time);
      const durationMs = end - start;
      const durationMinutes = Math.round(durationMs / (1000 * 60));
      duration = `${durationMinutes} minutes`;
    }
  } catch (error) {
    console.error('Error formatting date/time:', error);
  }

  return { formattedDate, formattedTime, duration };
}

/**
 * Check if email service is properly configured
 * @returns {boolean} - Whether email service is configured
 */
function isEmailServiceConfigured() {
  if (!EMAIL_SERVICE_ID || !EMAIL_PUBLIC_KEY) {
    console.warn('Email service not configured properly');
    return false;
  }
  return true;
}

/**
 * Send an email using EmailJS
 * @param {string} templateId - Email template ID
 * @param {Object} templateParams - Template parameters
 * @returns {Promise<Object>} - Result of email sending operation
 */
async function sendEmail(templateId, templateParams) {
  try {
    if (!isEmailServiceConfigured()) {
      return {
        success: false,
        error: 'Email service not configured'
      };
    }

    console.log(`Sending email with template ${templateId}:`, JSON.stringify(templateParams, null, 2));

    const response = await emailjs.send(
      EMAIL_SERVICE_ID,
      templateId,
      templateParams
    );

    console.log('Email response:', response);

    if (response.status === 200) {
      return { success: true, result: response };
    } else {
      throw new Error(`Email service returned status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error sending email:', error);
    return {
      success: false,
      error: error.message || 'Unknown error sending email'
    };
  }
}

/**
 * Send a booking confirmation email
 * @param {Object} bookingData - Booking data object
 * @returns {Promise<Object>} - Result of email sending operation
 */
export async function sendBookingConfirmationEmail(bookingData) {
  try {
    if (!EMAIL_CONFIRMATION_TEMPLATE_ID) {
      return {
        success: false,
        error: 'Confirmation template not configured'
      };
    }

    // Generate a booking reference if not provided
    const bookingReference = bookingData.reference || generateBookingReference();
    
    // Format date and time
    const { formattedDate, formattedTime, duration } = formatSlotDateTime(bookingData.slot);

    // Prepare template parameters
    const templateParams = {
      to_name: bookingData.userData.name || 'Valued Customer',
      to_email: bookingData.userData.email,
      booking_reference: bookingReference,
      booking_date: formattedDate,
      booking_time: formattedTime,
      booking_duration: duration,
      group_id: bookingData.userData.groupId || 'Not specified',
      notes: bookingData.userData.notes || 'No notes provided'
    };

    return await sendEmail(EMAIL_CONFIRMATION_TEMPLATE_ID, templateParams);
  } catch (error) {
    console.error('Error in sendBookingConfirmationEmail:', error);
    return {
      success: false,
      error: error.message || 'Unknown error sending confirmation email'
    };
  }
}

/**
 * Send a booking cancellation email
 * @param {Object} bookingData - Booking data object
 * @returns {Promise<Object>} - Result of email sending operation
 */
export async function sendCancellationEmail(bookingData) {
  try {
    if (!EMAIL_CANCELLATION_TEMPLATE_ID) {
      return {
        success: false,
        error: 'Cancellation template not configured'
      };
    }

    // Format date and time
    const { formattedDate, formattedTime, duration } = formatSlotDateTime(bookingData.slot);

    // Prepare template parameters
    const templateParams = {
      to_name: bookingData.userData.name || 'Valued Customer',
      to_email: bookingData.userData.email,
      booking_reference: bookingData.reference || 'N/A',
      booking_date: formattedDate,
      booking_time: formattedTime,
      booking_duration: duration,
      group_id: bookingData.userData.groupId || 'Not specified',
      reason: bookingData.cancellationReason || '',
      status: 'Cancelled',
      status_reason: bookingData.cancellationReason || 'No reason provided'
    };

    return await sendEmail(EMAIL_CANCELLATION_TEMPLATE_ID, templateParams);
  } catch (error) {
    console.error('Error in sendCancellationEmail:', error);
    return {
      success: false,
      error: error.message || 'Unknown error sending cancellation email'
    };
  }
}

/**
 * Send a status update email
 * @param {Object} reservationData - Reservation data object
 * @param {string} status - New status
 * @param {string} reason - Reason for status change
 * @returns {Promise<Object>} - Result of email sending operation
 */
export async function sendStatusUpdateEmail(reservationData, status, reason = '') {
  try {
    if (!EMAIL_CANCELLATION_TEMPLATE_ID) {
      return {
        success: false,
        error: 'Status update template not configured'
      };
    }

    // Format date and time
    const { formattedDate, formattedTime } = formatSlotDateTime(reservationData.slots);

    // Capitalize status for display
    const formattedStatus = status.charAt(0).toUpperCase() + status.slice(1);

    // Prepare template parameters
    const templateParams = {
      to_name: reservationData.user_name || 'Valued Customer',
      to_email: reservationData.user_email,
      booking_reference: reservationData.reference || 'N/A',
      booking_date: formattedDate,
      booking_time: formattedTime,
      reason: reason || 'No reason provided',
      status: formattedStatus,
      status_reason: reason || 'No reason provided',
      group_id: reservationData.group_id || 'N/A'
    };

    return await sendEmail(EMAIL_CANCELLATION_TEMPLATE_ID, templateParams);
  } catch (error) {
    console.error('Error in sendStatusUpdateEmail:', error);
    return {
      success: false,
      error: error.message || 'Unknown error sending status update email'
    };
  }
}
