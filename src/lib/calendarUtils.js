import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

/**
 * Converts a slot object to a calendar event format
 * @param {Object} slot - The slot object with start_time, end_time, and is_available
 * @returns {Object} - Formatted calendar event
 */
export function slotToCalendarEvent(slot) {
  return {
    id: slot.id,
    title: slot.is_available ? 'Available' : 'Booked',
    start: slot.start_time,
    end: slot.end_time,
    backgroundColor: slot.is_available ? '#10B981' : '#EF4444',
    borderColor: slot.is_available ? '#059669' : '#DC2626',
    textColor: '#FFFFFF',
    extendedProps: {
      is_available: slot.is_available
    }
  };
}

/**
 * Checks if a slot is disabled (in past or within next hour)
 * @param {string} startTime - ISO string of slot start time
 * @returns {boolean} - Whether the slot is disabled
 */
export function isSlotDisabled(startTime) {
  const now = new Date();
  const slotStart = new Date(startTime);

  // Round down to the nearest hour for comparison
  const currentHour = new Date(now);
  currentHour.setMinutes(0, 0, 0);

  // Calculate one hour from now, rounded to the next hour
  const oneHourFromNow = new Date(currentHour);
  oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);

  // Slot is disabled if it's in the past or within the next hour
  return slotStart <= oneHourFromNow;
}

/**
 * Shared calendar configuration for both admin and booking pages
 */
export const calendarConfig = {
  plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
  initialView: 'timeGridWeek',
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: 'dayGridMonth,timeGridWeek,timeGridDay'
  },
  dayMaxEvents: true,
  weekends: true,
  slotDuration: '01:00:00',
  slotLabelInterval: '01:00:00',
  allDaySlot: false,
  expandRows: true,
  stickyHeaderDates: true,
  height: 'auto',
  contentHeight: 700,
  slotMinTime: '00:00:00',
  slotMaxTime: '24:00:00',
  slotLabelFormat: {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  },
  validRange: {
    start: new Date()
  }
};