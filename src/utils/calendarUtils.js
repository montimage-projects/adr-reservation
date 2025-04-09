import ical from 'ical-generator';

/**
 * Generate an .ics file content for a reservation
 * @param {Object} slot - The reserved slot
 * @param {Object} userData - User information
 * @returns {string} - .ics file content
 */
export function generateICalEvent(slot, userData) {
  const calendar = ical({ name: 'ADR Cyberrange Reservation' });

  const startTime = new Date(slot.start_time);
  const endTime = new Date(slot.end_time);

  calendar.createEvent({
    start: startTime,
    end: endTime,
    summary: 'ADR Cyberrange Reservation',
    description: `
      Reservation for ${userData.name}
      Group: ${userData.groupId}
      ${userData.notes ? `Notes: ${userData.notes}` : ''}
    `,
    location: 'ADR Cyberrange',
    url: window.location.origin,
    organizer: {
      name: 'ADR Cyberrange',
      email: 'noreply@example.com'
    }
  });

  return calendar.toString();
}

/**
 * Generate calendar links for popular platforms
 * @param {Object} slot - The reserved slot
 * @param {Object} userData - User information
 * @returns {Object} - Object containing links for different calendar platforms
 */
export function generateCalendarLinks(slot, userData) {
  const startTime = new Date(slot.start_time);
  const endTime = new Date(slot.end_time);

  // Format dates for URLs
  const start = formatDateForUrl(startTime);
  const end = formatDateForUrl(endTime);

  // Create event details
  const title = encodeURIComponent('ADR Cyberrange Reservation');
  const details = encodeURIComponent(`
    Reservation for ${userData.name}
    Group: ${userData.groupId}
    ${userData.notes ? `Notes: ${userData.notes}` : ''}
  `);
  const location = encodeURIComponent('ADR Cyberrange');

  // Generate links for different platforms
  return {
    google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${location}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?subject=${title}&startdt=${startTime.toISOString()}&enddt=${endTime.toISOString()}&body=${details}&location=${location}`
  };
}

/**
 * Format a date for calendar URL
 * @param {Date} date - Date to format
 * @returns {string} - Formatted date string (YYYYMMDDTHHmmssZ)
 */
function formatDateForUrl(date) {
  return date.toISOString().replace(/-|:|\.\d+/g, '');
}

/**
 * Download an .ics file
 * @param {string} icsContent - .ics file content
 * @param {string} filename - Name for the downloaded file
 */
export function downloadIcsFile(icsContent, filename = 'reservation.ics') {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}