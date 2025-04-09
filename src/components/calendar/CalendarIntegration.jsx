import { generateICalEvent, generateCalendarLinks, downloadIcsFile } from '../../utils/calendarUtils';

function CalendarIntegration({ slot, userData }) {
  if (!slot || !userData) return null;

  const calendarLinks = generateCalendarLinks(slot, userData);

  const handleDownloadIcs = () => {
    const icsContent = generateICalEvent(slot, userData);
    downloadIcsFile(icsContent);
  };

  return (
    <div className="mt-6 card">
      <div className="card-header bg-primary-50 dark:bg-primary-900/30">
        <h3 className="text-lg font-medium text-primary-800 dark:text-primary-300">
          Add to Your Calendar
        </h3>
      </div>

      <div className="card-body">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Don't forget your reservation! Add it to your calendar with one of the options below.
        </p>

        <div className="flex flex-wrap gap-2">
          <a
            href={calendarLinks.google}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
              <path fill="white" d="M10 17l5-5-5-5v10z"/>
            </svg>
            Google Calendar
          </a>

          <a
            href={calendarLinks.outlook}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary inline-flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-8 14H7v-7h4v7zm6 0h-4v-7h4v7zm0-9H7V5h10v3z"/>
            </svg>
            Outlook Calendar
          </a>

          <button
            onClick={handleDownloadIcs}
            className="btn-secondary inline-flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download .ics File
          </button>
        </div>
      </div>
    </div>
  );
}

export default CalendarIntegration;