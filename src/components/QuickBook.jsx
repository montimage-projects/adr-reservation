import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getClosestAvailableSlot } from '../lib/firebase';
import LoadingSpinner from './LoadingSpinner';

function QuickBook() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleQuickBook = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get the closest available slot
      const slot = await getClosestAvailableSlot();

      if (!slot) {
        setError('No slots are available right now. Please check the calendar later.');
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