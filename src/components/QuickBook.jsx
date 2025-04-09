import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getClosestAvailableSlot, checkSlotsExist, createTestSlots } from '../lib/supabase';
import LoadingSpinner from './LoadingSpinner';

function QuickBook({ showTestOptions = false }) {
  const [loading, setLoading] = useState(false);
  const [creatingSlots, setCreatingSlots] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleQuickBook = async () => {
    setLoading(true);
    setError(null);

    try {
      // Check if there are any slots in the database
      const slotsExist = await checkSlotsExist();

      if (!slotsExist) {
        setError('No available slots found in the database. Click "Create Test Slots" to add some for testing.');
        setLoading(false);
        return;
      }

      // Get the closest available slot
      const slot = await getClosestAvailableSlot();

      if (!slot) {
        setError('All slots are currently booked. Click "Create Test Slots" to add more for testing.');
        setLoading(false);
        return;
      }

      // Store the slot in sessionStorage to access it on the booking page
      sessionStorage.setItem('quickBookSlot', JSON.stringify(slot));

      // Navigate to the booking page
      navigate('/book?quick=true');
    } catch (err) {
      console.error('Error finding closest slot:', err);
      setError('Failed to find an available slot. Please try again.');
      setLoading(false);
    }
  };

  const handleCreateTestSlots = async () => {
    setCreatingSlots(true);
    setError(null);

    try {
      await createTestSlots();
      setError('Test slots created successfully! You can now use Quick Book.');
    } catch (err) {
      console.error('Error creating test slots:', err);

      // Handle specific error for missing service key
      if (err.message && err.message.includes('Service key not configured')) {
        setError('Admin permissions required. Please add a service key in your .env.local file.');
      } else if (err.code === '42501') {
        setError('Permission denied. The application lacks necessary database permissions.');
      } else {
        setError('Failed to create test slots. Please try again.');
      }
    } finally {
      setCreatingSlots(false);
    }
  };

  return (
    <div className="mt-4">
      <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4">
        <button
          onClick={handleQuickBook}
          disabled={loading}
          className="btn-primary flex items-center justify-center w-full sm:w-auto"
        >
          {loading ? (
            <>
              <LoadingSpinner size="small" />
              <span className="ml-2">Finding slot...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Quick Book Next Available
            </>
          )}
        </button>
      </div>

      {error && (
        <div className={`mt-2 text-sm ${error.includes('created successfully') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {error}
        </div>
      )}
    </div>
  );
}

export default QuickBook;