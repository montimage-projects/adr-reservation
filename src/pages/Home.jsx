import { Link } from 'react-router-dom'
import QuickBook from '../components/QuickBook'

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 text-center">
      <h1 className="text-4xl font-bold mb-8 text-gray-900 dark:text-white">
        Welcome to ADR Cyberrange
      </h1>

      <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
        Book your reservation slot for the cyberrange facilities.
      </p>

      <div className="space-y-6">
        <div className="card p-6">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
            Reserve Your Time Slot
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Use our easy booking system to secure your slot for training or research in the ADR Cyberrange environment.
          </p>
          <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 justify-center">
            <Link
              to="/book"
              className="btn-primary inline-block"
            >
              Book a Slot
            </Link>
            <QuickBook />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <div className="card p-6">
            <h3 className="text-xl font-semibold mb-3 text-gray-800 dark:text-gray-200">
              Flexible Scheduling
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Choose from available 1-hour slots that fit your schedule. Real-time availability updates ensure you always see the current options.
            </p>
          </div>

          <div className="card p-6">
            <h3 className="text-xl font-semibold mb-3 text-gray-800 dark:text-gray-200">
              Calendar Integration
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              After booking, easily add your reservation to your preferred calendar with our seamless calendar integration.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}