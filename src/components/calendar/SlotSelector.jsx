import { formatDate } from '../../utils/dateUtils';
import Badge from '../Badge';
import { useSearchParams } from 'react-router-dom';

function SlotSelector({ selectedSlot }) {
  const [searchParams] = useSearchParams();
  const isQuickBooked = searchParams.get('quick') === 'true';

  if (!selectedSlot) {
    return (
      <div className="card">
        <div className="card-body">
          <p className="text-gray-500 dark:text-gray-400 text-center">
            Select an available time slot from the calendar to make a reservation.
          </p>
        </div>
      </div>
    );
  }

  const startTime = new Date(selectedSlot.start_time);
  const endTime = new Date(selectedSlot.end_time);

  const formattedDate = formatDate(startTime, 'EEEE, MMMM d, yyyy');
  const formattedStartTime = formatDate(startTime, 'h:mm a');
  const formattedEndTime = formatDate(endTime, 'h:mm a');

  return (
    <div className="card">
      <div className="card-header flex justify-between items-center">
        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Selected Time Slot</h3>
        {isQuickBooked && <Badge color="success">Auto-Selected</Badge>}
      </div>

      <div className="card-body">
        <p className="font-medium text-gray-800 dark:text-gray-200">{formattedDate}</p>
        <p className="text-gray-700 dark:text-gray-300">
          {formattedStartTime} - {formattedEndTime}
        </p>
      </div>
    </div>
  );
}

export default SlotSelector;