import { format, parseISO } from 'date-fns';

/**
 * Format a date object or string into a human-readable date format
 * @param {Date|string} date - Date object or string
 * @param {string} [formatStr='EEEE, MMMM d, yyyy'] - Format string (see date-fns format)
 * @returns {string} Formatted date
 */
export function formatDate(date, formatStr = 'EEEE, MMMM d, yyyy') {
  try {
    const dateObj = date instanceof Date ? date : new Date(date);
    return format(dateObj, formatStr);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
}

/**
 * Format a time string into a human-readable time format
 * @param {string} time - Time string in format HH:MM:SS
 * @returns {string} Formatted time
 */
export function formatTime(time) {
  try {
    // Create a date object from the time string
    const [hours, minutes] = time.split(':');
    const date = new Date();
    date.setHours(parseInt(hours, 10));
    date.setMinutes(parseInt(minutes, 10));

    // This formats the time in 24-hour format (hour12: false)
    // hour: '2-digit' ensures hours are always 2 digits (e.g., "09" instead of "9")
    // minute: '2-digit' ensures minutes are always 2 digits (e.g., "05" instead of "5")
    // The result will look like "14:30" instead of "2:30 PM"
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch (error) {
    console.error('Error formatting time:', error);
    return time; // Return the original time string if parsing fails
  }
}

/**
 * Format a date and time into a human-readable datetime format
 * @param {Date} datetime - Date object including time
 * @returns {string} Formatted date and time
 */
export function formatDateTime(datetime) {
  try {
    const dateObj = datetime instanceof Date ? datetime : new Date(datetime);

    // Format date part
    const datePart = dateObj.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    // Format time part
    const timePart = dateObj.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    return `${datePart}, ${timePart}`;
  } catch (error) {
    console.error('Error formatting datetime:', error);
    return 'Invalid date/time';
  }
}

/**
 * Calculate the duration between a start and end time
 * @param {string} startTime - Start time in format HH:MM:SS
 * @param {string} endTime - End time in format HH:MM:SS
 * @returns {number} Duration in minutes
 */
export function calculateDuration(startTime, endTime) {
  try {
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);

    const startTotalMinutes = (startHours * 60) + startMinutes;
    const endTotalMinutes = (endHours * 60) + endMinutes;

    return endTotalMinutes - startTotalMinutes;
  } catch (error) {
    console.error('Error calculating duration:', error);
    return 0;
  }
}

/**
 * Convert a date to an ISO string that's suitable for Supabase queries
 * @param {Date} date - Date to convert
 * @returns {string} - ISO string
 */
export function toISOString(date) {
  return date.toISOString();
}

/**
 * Add hours to a date
 * @param {Date} date - Starting date
 * @param {number} hours - Number of hours to add
 * @returns {Date} - New date with hours added
 */
export function addHours(date, hours) {
  const newDate = new Date(date);
  newDate.setHours(newDate.getHours() + hours);
  return newDate;
}