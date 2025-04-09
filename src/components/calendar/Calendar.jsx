import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { getAvailableSlots, subscribeToSlots } from '../../lib/supabase';
import LoadingSpinner from '../LoadingSpinner';
import { useTheme } from '../../utils/ThemeContext';
import './calendar.css';
import { formatDate } from '../../utils/dateUtils';
import { isSlotDisabled } from '../../lib/calendarUtils';

function Calendar({ onSlotSelect, initialSelectedSlot }) {
  const [slots, setSlots] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const calendarRef = useRef(null);
  const calendarApiRef = useRef(null);
  const { darkMode } = useTheme();

  // Function to fetch slots for a date range
  const fetchSlots = useCallback(async (startDate, endDate) => {
    setIsLoading(true);
    try {
      const slotsData = await getAvailableSlots(startDate, endDate);
      console.log('Fetched slots:', slotsData);
      setSlots(slotsData);
      return slotsData;
    } catch (err) {
      console.error('Error fetching slots:', err);
      setError('Failed to load available slots. Please try again later.');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch on component mount
  useEffect(() => {
    const fetchInitialSlots = async () => {
      const now = new Date();
      const startDate = now.toISOString();
      const endDate = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        now.getDate()
      ).toISOString();

      const slotsData = await fetchSlots(startDate, endDate);

      // If no slots found, you might want to indicate this
      if (!slotsData || slotsData.length === 0) {
        setError('No slots available in the database. Use the "Create Test Slots" option above. If that fails, ensure your .env.local file includes a service role key.');
      } else {
        // Find the first available slot
        const firstAvailableSlot = slotsData.find(slot => slot.is_available && !isSlotDisabled(slot.start_time));
        if (firstAvailableSlot && calendarRef.current) {
          const slotDate = new Date(firstAvailableSlot.start_time);
          calendarRef.current.getApi().gotoDate(slotDate);
        }
      }
    };

    fetchInitialSlots();
  }, [fetchSlots]);

  // If there's an initial selected slot, scroll to it
  useLayoutEffect(() => {
    if (initialSelectedSlot && calendarApiRef.current) {
      const slotDate = new Date(initialSelectedSlot.start_time);

      // Go to the week containing the selected slot
      calendarApiRef.current.gotoDate(slotDate);

      // Change to week view if not already
      if (calendarApiRef.current.view.type !== 'timeGridWeek') {
        calendarApiRef.current.changeView('timeGridWeek');
      }

      // Highlight the day
      calendarApiRef.current.select(slotDate);
    }
  }, [initialSelectedSlot]);

  // Set up real-time subscription
  useEffect(() => {
    // Subscribe to slot changes
    const unsubscribe = subscribeToSlots((payload) => {
      // When we receive a real-time update
      console.log('Slot update received:', payload);

      // Handle different types of changes
      if (payload.eventType === 'UPDATE') {
        // Update a single slot in our local state
        setSlots(currentSlots => {
          return currentSlots.map(slot => {
            if (slot.id === payload.new.id) {
              return { ...slot, ...payload.new };
            }
            return slot;
          });
        });
      } else if (payload.eventType === 'INSERT') {
        // Add a new slot to our local state
        setSlots(currentSlots => [...currentSlots, payload.new]);
      } else if (payload.eventType === 'DELETE') {
        // Remove a slot from our local state
        setSlots(currentSlots =>
          currentSlots.filter(slot => slot.id !== payload.old.id)
        );
      }
    });

    // Clean up subscription on component unmount
    return () => {
      unsubscribe();
    };
  }, []);

  const handleDatesSet = useCallback(async (calendarInfo) => {
    // Keep reference to calendar API for potential refreshes
    if (!calendarApiRef.current && calendarInfo.view.calendar) {
      calendarApiRef.current = calendarInfo.view.calendar;
    }

    const startDate = calendarInfo.startStr;
    const endDate = calendarInfo.endStr;
    await fetchSlots(startDate, endDate);
  }, [fetchSlots]);

  const handleSlotClick = useCallback((info) => {
    console.log('Slot clicked:', info.dateStr, info.date);

    // Find the slot in our data that corresponds to the clicked time
    const clickedDate = new Date(info.date);

    // Look for any slot that overlaps with the clicked time
    const availableSlots = slots.filter(slot => {
      // Only consider available slots
      if (!slot.is_available) return false;

      const slotStart = new Date(slot.start_time);
      const slotEnd = new Date(slot.end_time);

      // Check if the clicked time falls within this slot's time range
      return clickedDate >= slotStart && clickedDate < slotEnd;
    });

    console.log('Available slots found:', availableSlots);

    // If we found a matching slot, select it
    if (availableSlots.length > 0) {
      onSlotSelect(availableSlots[0]);
    } else {
      console.log('No available slot found at this time');
      setError('No available slot at the selected time. Please click on a green "Available" time slot.');
      setTimeout(() => setError(null), 3000); // Clear the error after 3 seconds
    }
  }, [slots, onSlotSelect]);

  const handleEventClick = useCallback((info) => {
    // Handle direct clicks on event boxes
    const eventId = info.event.id;
    const isAvailable = info.event.extendedProps.isAvailable;
    console.log('Event clicked:', eventId, 'Available:', isAvailable);

    if (!isAvailable) {
      setError('This slot is already booked. Please select an available slot (green).');
      setTimeout(() => setError(null), 3000); // Clear the error after 3 seconds
      return;
    }

    const slot = slots.find(s => s.id === eventId);

    if (slot) {
      console.log('Slot found for event:', slot);
      onSlotSelect(slot);
    } else {
      console.error('Could not find slot for event ID:', eventId);
    }
  }, [slots, onSlotSelect]);

  const eventContent = (eventInfo) => {
    const event = eventInfo.event;
    const isAvailable = event.extendedProps.isAvailable;
    const startTime = formatDate(new Date(event.start), 'h:mm a');
    const endTime = formatDate(new Date(event.end), 'h:mm a');

    return (
      <div className={`p-1 text-xs rounded border cursor-pointer ${
        isAvailable
          ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700'
          : 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700'
      } transition-colors duration-200`}>
        {startTime} - {endTime}
      </div>
    );
  };

  // Transform slot data into FullCalendar events
  const events = slots
    .filter(slot => !isSlotDisabled(slot.start_time))
    .map(slot => ({
      id: slot.id,
      title: slot.is_available ? 'Available' : 'Booked',
      start: slot.start_time,
      end: slot.end_time,
      extendedProps: {
        isAvailable: slot.is_available,
        slotId: slot.id
      },
      color: slot.is_available
        ? (darkMode ? '#065f46' : '#d1fae5')
        : (darkMode ? '#7f1d1d' : '#fee2e2'),
      display: 'block',
      interactive: slot.is_available
    }));

  return (
    <div className={`relative min-h-[500px] card ${darkMode ? 'fc-theme-dark' : ''}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 bg-opacity-70 dark:bg-opacity-70 z-10">
          <LoadingSpinner />
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded">
          {error}
        </div>
      )}

      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay'
        }}
        slotDuration="01:00:00"
        slotLabelInterval="01:00:00"
        slotMinTime="00:00:00"
        slotMaxTime="24:00:00"
        allDaySlot={false}
        height="auto"
        events={events}
        eventContent={eventContent}
        dateClick={handleSlotClick}
        eventClick={handleEventClick}
        datesSet={handleDatesSet}
        nowIndicator={true}
        businessHours={{
          daysOfWeek: [1, 2, 3, 4, 5], // Monday to Friday
          startTime: '00:00',
          endTime: '24:00',
        }}
        selectable={true}
        unselectAuto={true}
        eventTimeFormat={{
          hour: '2-digit',
          minute: '2-digit',
          meridiem: 'short'
        }}
      />
    </div>
  );
}

export default Calendar;