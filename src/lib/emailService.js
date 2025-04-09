import emailjs from '@emailjs/browser';

// Email.js service configuration (replace with your own credentials)
const EMAIL_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || 'service_default';
const EMAIL_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 'template_default';
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
 * Send a booking confirmation email
 * @param {Object} bookingData - Booking data object
 * @returns {Promise<Object>} - Result of email sending operation
 */
export async function sendBookingConfirmationEmail(bookingData) {
  try {
    if (!EMAIL_SERVICE_ID || !EMAIL_TEMPLATE_ID || !EMAIL_PUBLIC_KEY) {
      console.warn('Email service not configured properly');
      return {
        success: false,
        error: 'Email service not configured'
      };
    }

    // Generate a booking reference if not provided
    const bookingReference = bookingData.reference || generateBookingReference();

    // Safe date parsing to handle different date formats
    let formattedDate = 'Date not available';
    let formattedTime = 'Time not available';

    try {
      // Different ways to get the date based on the slot object structure
      let bookingDate;

      if (bookingData.slot.date && bookingData.slot.start_time) {
        // Format 1: separate date and time fields
        bookingDate = new Date(`${bookingData.slot.date} ${bookingData.slot.start_time}`);
      } else if (bookingData.slot.start_time && bookingData.slot.start_time.includes('T')) {
        // Format 2: ISO string in start_time
        bookingDate = new Date(bookingData.slot.start_time);
      } else if (bookingData.slot.start_time) {
        // Format 3: just a time string, use current date
        const today = new Date().toISOString().split('T')[0];
        bookingDate = new Date(`${today}T${bookingData.slot.start_time}`);
      }

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
    } catch (dateError) {
      console.error('Error formatting date for email:', dateError);
      // Continue with default values set above
    }

    // Prepare template parameters
    const templateParams = {
      to_name: bookingData.userData.name || 'Valued Customer',
      to_email: bookingData.userData.email,
      booking_reference: bookingReference,
      booking_date: formattedDate,
      booking_time: formattedTime,
      booking_duration: bookingData.slot.duration ? `${bookingData.slot.duration} minutes` : 'Duration not specified',
      booking_notes: bookingData.userData.notes || 'No additional notes',
      group_id: bookingData.userData.groupId || 'Not specified'
    };

    console.log('Sending email with params:', templateParams);

    // Send the email
    const response = await emailjs.send(
      EMAIL_SERVICE_ID,
      EMAIL_TEMPLATE_ID,
      templateParams
    );

    if (response.status === 200) {
      return {
        success: true,
        reference: bookingReference
      };
    } else {
      throw new Error(`Email service returned status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    return {
      success: false,
      error: error.message || 'Unknown error sending email'
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
    if (!EMAIL_SERVICE_ID || !EMAIL_TEMPLATE_ID || !EMAIL_PUBLIC_KEY) {
      console.warn('Email service not configured properly');
      return {
        success: false,
        error: 'Email service not configured'
      };
    }

    // Format date/time for email
    const bookingDate = new Date(`${bookingData.slot.date} ${bookingData.slot.start_time}`);
    const formattedDate = bookingDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const formattedTime = bookingDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    // Prepare template parameters
    const templateParams = {
      to_name: bookingData.userData.name,
      to_email: bookingData.userData.email,
      booking_reference: bookingData.reference,
      booking_date: formattedDate,
      booking_time: formattedTime,
      cancellation_reason: bookingData.cancellationReason || 'User requested cancellation'
    };

    // Send the email
    const response = await emailjs.send(
      EMAIL_SERVICE_ID,
      EMAIL_TEMPLATE_ID,
      templateParams
    );

    if (response.status === 200) {
      return { success: true };
    } else {
      throw new Error(`Email service returned status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error sending cancellation email:', error);
    return {
      success: false,
      error: error.message || 'Unknown error sending email'
    };
  }
}