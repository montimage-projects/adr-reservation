import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAdminAuthenticated } from '../lib/authService';
import LoadingSpinner from '../components/LoadingSpinner';
import { getAvailableSlots, createSlot, deleteSlot, updateSlot } from '../lib/supabase';
import FullCalendar from '@fullcalendar/react';
import { slotToCalendarEvent, isSlotDisabled, calendarConfig } from '../lib/calendarUtils';

export default function AdminSlotPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [slots, setSlots] = useState([]);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [slotForm, setSlotForm] = useState({
    startDateTime: '',
    endDateTime: '',
  });
  const [view, setView] = useState('table'); // 'table' or 'calendar'
  const calendarRef = useRef(null);
  const [batchCreateOpen, setBatchCreateOpen] = useState(false);
  const [batchForm, setBatchForm] = useState({
    startDate: '',
    endDate: '',
    days: [1, 2, 3, 4, 5], // Default to weekdays (0=Sunday, 1=Monday, etc.)
    startTime: '09:00',
    endTime: '17:00',
    slotDuration: 1, // hours
  });

  const navigate = useNavigate();

  // Check authentication status on load
  useEffect(() => {
    const checkAuth = async () => {
      setIsCheckingAuth(true);
      try {
        const isAuth = await isAdminAuthenticated();
        setIsAuthenticated(isAuth);
        if (!isAuth) {
          navigate('/admin');
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        setIsAuthenticated(false);
        navigate('/admin');
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, [navigate]);

  // Fetch slots when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchSlots();
    }
  }, [isAuthenticated]);

  const fetchSlots = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get date range for next 30 days
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString(); // Start of current month
      const futureDate = new Date(now.getFullYear(), now.getMonth() + 2, 0); // End of next month
      const endDate = futureDate.toISOString();

      const data = await getAvailableSlots(startDate, endDate);
      setSlots(data);
    } catch (err) {
      console.error('Error fetching slots:', err);
      setError(err.message || 'Failed to load slots. Make sure your service key is configured.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setSlotForm({
      ...slotForm,
      [name]: value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage('');

    try {
      const startDateTime = new Date(slotForm.startDateTime);
      const endDateTime = new Date(slotForm.endDateTime);

      if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
        throw new Error('Invalid date or time format');
      }

      if (endDateTime <= startDateTime) {
        throw new Error('End time must be after start time');
      }

      // Round the start time to the beginning of the hour
      startDateTime.setMinutes(0, 0, 0);

      // Ensure the end time is also at the beginning of an hour
      // If end time is not at the start of an hour, round up to the next hour
      if (endDateTime.getMinutes() > 0 || endDateTime.getSeconds() > 0) {
        endDateTime.setHours(endDateTime.getHours() + 1);
        endDateTime.setMinutes(0, 0, 0);
      }

      // Calculate number of 1-hour slots
      const totalHours = Math.ceil((endDateTime - startDateTime) / (60 * 60 * 1000));

      // Create slots in batches
      const batchSize = 10;
      const slotsToCreate = [];
      let currentStart = new Date(startDateTime);

      for (let i = 0; i < totalHours; i++) {
        // Create a slot that starts at the beginning of the hour
        const slotStart = new Date(currentStart);
        slotStart.setMinutes(0, 0, 0);

        // End time is exactly one hour later
        const slotEnd = new Date(slotStart);
        slotEnd.setHours(slotStart.getHours() + 1);

        // Check if the slot would cross midnight
        if (slotEnd.getDate() !== slotStart.getDate()) {
          // Adjust the end time to be the end of the current day
          slotEnd.setHours(23, 59, 59, 999);
        }

        // Only create the slot if it's within the same day
        if (slotStart.getDate() === slotEnd.getDate()) {
          slotsToCreate.push({
            start_time: slotStart.toISOString(),
            end_time: slotEnd.toISOString(),
            is_available: true
          });
        }

        // Move to the next hour
        currentStart.setHours(currentStart.getHours() + 1);
      }

      // Confirm with user before creating slots
      if (!confirm(`You are about to create ${slotsToCreate.length} slots. Continue?`)) {
        setIsLoading(false);
        return;
      }

      // Create slots in batches
      for (let i = 0; i < slotsToCreate.length; i += batchSize) {
        const batch = slotsToCreate.slice(i, i + batchSize);
        await Promise.all(batch.map(slot => createSlot(slot)));
      }

      setSuccessMessage(`Created ${slotsToCreate.length} slots successfully`);
      resetForm();
      await fetchSlots();
    } catch (err) {
      console.error('Error creating slots:', err);
      setError(err.message || 'Failed to create slots. Make sure your service key is configured.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditSlot = (slot) => {
    // Convert ISO dates to local date and time for form
    const startDate = new Date(slot.start_time);
    const endDate = new Date(slot.end_time);

    setSlotForm({
      startDateTime: startDate.toISOString(),
      endDateTime: endDate.toISOString(),
    });

    setEditingSlot(slot);
    setShowForm(true);
    setView('table');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteSlot = async (slotId) => {
    if (!confirm('Are you sure you want to delete this slot?')) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await deleteSlot(slotId);
      setSuccessMessage('Slot deleted successfully');
      await fetchSlots();
    } catch (err) {
      console.error('Error deleting slot:', err);
      setError(err.message || 'Failed to delete slot. Make sure your service key is configured.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleSlotAvailability = async (slot) => {
    setIsLoading(true);
    setError(null);

    try {
      const updatedSlot = {
        ...slot,
        is_available: !slot.is_available
      };

      await updateSlot(slot.id, updatedSlot);
      setSuccessMessage(`Slot ${updatedSlot.is_available ? 'enabled' : 'disabled'} successfully`);
      await fetchSlots();
    } catch (err) {
      console.error('Error updating slot:', err);
      setError(err.message || 'Failed to update slot. Make sure your service key is configured.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setSlotForm({
      startDateTime: '',
      endDateTime: '',
    });
    setEditingSlot(null);
    setShowForm(false);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  // Filter out past slots and slots within next hour
  const validSlots = slots.filter(slot => !isSlotDisabled(slot.start_time));

  // Convert slots to calendar events
  const calendarEvents = validSlots.map(slotToCalendarEvent);

  const handleBatchInputChange = (e) => {
    const { name, value, type } = e.target;

    if (name === 'days') {
      // Handle checkboxes for days differently
      const dayValue = parseInt(e.target.value, 10);
      const isChecked = e.target.checked;

      setBatchForm(prev => {
        const currentDays = [...prev.days];
        if (isChecked && !currentDays.includes(dayValue)) {
          currentDays.push(dayValue);
        } else if (!isChecked && currentDays.includes(dayValue)) {
          const index = currentDays.indexOf(dayValue);
          currentDays.splice(index, 1);
        }
        return { ...prev, days: currentDays };
      });
    } else {
      setBatchForm(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleCreateWeeklySchedule = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage('');

    try {
      // Parse the date range
      const startDate = new Date(batchForm.startDate);
      const endDate = new Date(batchForm.endDate);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Invalid date range');
      }

      if (endDate < startDate) {
        throw new Error('End date must be after start date');
      }

      // Parse times
      const [startHour, startMinute] = batchForm.startTime.split(':').map(n => parseInt(n, 10));
      const [endHour, endMinute] = batchForm.endTime.split(':').map(n => parseInt(n, 10));

      // For hourly slots, force the start time to be at the beginning of the hour
      const adjustedStartHour = startHour;
      // Round up the end hour if there are minutes specified
      const adjustedEndHour = endMinute > 0 ? endHour + 1 : endHour;

      // Calculate number of slots per day
      const hoursPerDay = adjustedEndHour - adjustedStartHour;
      if (hoursPerDay <= 0) {
        throw new Error('End time must be after start time');
      }

      const slotsToCreate = [];
      const currentDate = new Date(startDate);

      // Loop through each day in the date range
      while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay(); // 0 is Sunday, 1 is Monday, etc.

        // Check if this day is selected
        if (batchForm.days.includes(dayOfWeek)) {
          // Set the time to the start time
          const slotTime = new Date(currentDate);
          // Always set minutes to 0 to ensure slots start at the beginning of the hour
          slotTime.setHours(adjustedStartHour, 0, 0, 0);

          // Create slots for each hour in the day
          for (let hour = 0; hour < hoursPerDay; hour++) {
            const slotStart = new Date(slotTime);

            // Ensure slot starts at the beginning of the hour
            slotStart.setMinutes(0, 0, 0);

            // Add the duration to get the end time
            const slotEnd = new Date(slotStart);
            slotEnd.setHours(slotStart.getHours() + batchForm.slotDuration);

            // Add the slot to our list
            slotsToCreate.push({
              start_time: slotStart.toISOString(),
              end_time: slotEnd.toISOString(),
              is_available: true
            });

            // Move to next slot time
            slotTime.setHours(slotTime.getHours() + batchForm.slotDuration);
          }
        }

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Confirm with user before creating a large number of slots
      if (slotsToCreate.length > 20) {
        if (!confirm(`You are about to create ${slotsToCreate.length} slots. Continue?`)) {
          setIsLoading(false);
          return;
        }
      }

      // Create all slots in batches to avoid overwhelming the server
      const batchSize = 10;
      for (let i = 0; i < slotsToCreate.length; i += batchSize) {
        const batch = slotsToCreate.slice(i, i + batchSize);
        await Promise.all(batch.map(slot => createSlot(slot)));
      }

      setSuccessMessage(`Created ${slotsToCreate.length} slots successfully`);
      setBatchCreateOpen(false);
      await fetchSlots();
    } catch (err) {
      console.error('Error creating weekly schedule:', err);
      setError(err.message || 'Failed to create weekly schedule. Make sure your service key is configured.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAllSlots = async () => {
    if (!confirm('Are you sure you want to delete ALL available slots? This action cannot be undone.')) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Filter only available slots to delete
      const availableSlots = slots.filter(slot => slot.is_available);

      if (availableSlots.length === 0) {
        setSuccessMessage('No available slots to delete');
        setIsLoading(false);
        return;
      }

      // Confirm again with the exact number
      if (!confirm(`You are about to delete ${availableSlots.length} available slots. Proceed?`)) {
        setIsLoading(false);
        return;
      }

      // Delete slots in batches to avoid overwhelming the server
      const batchSize = 10;
      for (let i = 0; i < availableSlots.length; i += batchSize) {
        const batch = availableSlots.slice(i, i + batchSize);
        await Promise.all(batch.map(slot => deleteSlot(slot.id)));
      }

      setSuccessMessage(`Successfully deleted ${availableSlots.length} slots`);
      await fetchSlots();
    } catch (err) {
      console.error('Error deleting all slots:', err);
      setError(err.message || 'Failed to delete slots. Make sure your service key is configured.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to admin login page
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-5">
        <div>
          <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">Slot Management</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Define available time slots for bookings.
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => navigate('/admin')}
            className="btn-secondary"
          >
            Back to Dashboard
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-md text-red-600 dark:text-red-400">
          <p className="font-medium">Error</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-md text-green-600 dark:text-green-400">
          <p className="font-medium">{successMessage}</p>
          <button
            onClick={() => setSuccessMessage('')}
            className="ml-2 text-sm underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* View Toggle */}
      <div className="flex justify-center mb-4">
        <div className="inline-flex rounded-md shadow-sm" role="group">
          <button
            type="button"
            onClick={() => setView('table')}
            className={`px-4 py-2 text-sm font-medium rounded-l-lg ${
              view === 'table'
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Table View
          </button>
          <button
            type="button"
            onClick={() => setView('calendar')}
            className={`px-4 py-2 text-sm font-medium rounded-r-lg ${
              view === 'calendar'
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Calendar View
          </button>
        </div>
      </div>

      {/* Create Slots Form */}
      <div className="card">
        <div className="card-header bg-primary-50 dark:bg-primary-900/30">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-primary-800 dark:text-primary-300">
              Define Available Time Range
            </h3>
            <div className="flex space-x-2">
              <button
                onClick={handleDeleteAllSlots}
                className="btn-danger"
                disabled={isLoading}
              >
                Clear All Slots
              </button>
              <button
                onClick={() => setShowForm(!showForm)}
                className="btn-secondary"
              >
                {showForm ? 'Cancel' : 'Define Time Range'}
              </button>
            </div>
          </div>
        </div>

        {showForm && (
          <div className="card-body">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="startDateTime" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Start Date & Time
                  </label>
                  <div className="relative">
                    <input
                      type="datetime-local"
                      id="startDateTime"
                      name="startDateTime"
                      value={slotForm.startDateTime}
                      onChange={handleInputChange}
                      className="input"
                      required
                      step="3600" // This makes the time picker step in hours
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <span className="text-gray-500 dark:text-gray-400 text-sm">HH:00</span>
                    </div>
                  </div>
                </div>
                <div>
                  <label htmlFor="endDateTime" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    End Date & Time
                  </label>
                  <div className="relative">
                    <input
                      type="datetime-local"
                      id="endDateTime"
                      name="endDateTime"
                      value={slotForm.endDateTime}
                      onChange={handleInputChange}
                      className="input"
                      required
                      step="3600" // This makes the time picker step in hours
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <span className="text-gray-500 dark:text-gray-400 text-sm">HH:00</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded border border-blue-200 dark:border-blue-700">
                <p className="text-blue-700 dark:text-blue-300 text-sm">
                  <span className="font-medium">Note:</span> Slots are created in 1-hour intervals starting at the beginning of each hour (e.g., 9:00, 10:00).
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isLoading}
                >
                  {isLoading ? 'Creating Slots...' : 'Create Slots'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Calendar View */}
      {view === 'calendar' && (
        <div className="card">
          <div className="card-header bg-primary-50 dark:bg-primary-900/30">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium text-primary-800 dark:text-primary-300">
                Calendar View
              </h3>
            </div>
          </div>
          <div className="card-body p-0 overflow-hidden">
            <div className="p-4">
              <FullCalendar
                ref={calendarRef}
                {...calendarConfig}
                events={calendarEvents}
              />
            </div>
          </div>
        </div>
      )}

      {/* Slots List */}
      {view === 'table' && (
        <div className="card">
          <div className="card-header bg-primary-50 dark:bg-primary-900/30">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium text-primary-800 dark:text-primary-300">
                Available Slots
              </h3>
            </div>
          </div>
          <div className="card-body">
            {isLoading && !slots.length ? (
              <div className="flex justify-center py-10">
                <LoadingSpinner />
              </div>
            ) : validSlots.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Date
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Time
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Toggle
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                    {validSlots.map((slot) => (
                      <tr key={slot.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {formatDate(slot.start_time)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <label className={`inline-flex items-center ${isSlotDisabled(slot.start_time) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={slot.is_available}
                              onChange={() => handleToggleSlotAvailability(slot)}
                              disabled={isLoading || isSlotDisabled(slot.start_time)}
                            />
                            <div className={`relative w-11 h-6 rounded-full peer ${
                              isSlotDisabled(slot.start_time)
                                ? 'bg-gray-300 dark:bg-gray-600'
                                : 'bg-gray-200 dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-600'
                            }`}></div>
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600 dark:text-gray-400">No slots available.</p>
                <button
                  onClick={() => setShowForm(true)}
                  className="mt-4 btn-primary"
                >
                  Define Time Range
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}