import { useState, useEffect } from 'react'
import { getReservations, checkSlotsExist, createTestSlots } from '../lib/supabase'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  isFirstTimeSetup,
  setupAdminPassword,
  loginAdmin,
  logoutAdmin,
  isAdminAuthenticated
} from '../lib/authService'
import { useNavigate } from 'react-router-dom'

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [error, setError] = useState(null)
  const [reservations, setReservations] = useState([])
  const [availableSlots, setAvailableSlots] = useState('--')
  const [firstTimeSetup, setFirstTimeSetup] = useState(false)
  const [loginForm, setLoginForm] = useState({
    password: '',
    confirmPassword: ''
  })
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const navigate = useNavigate()

  // Check authentication status on load
  useEffect(() => {
    const checkAuth = async () => {
      setIsCheckingAuth(true)
      // Check if this is the first time setup
      const isFirstTime = isFirstTimeSetup()

      // Check if the user is already authenticated
      try {
        const isAuth = await isAdminAuthenticated()
        setIsAuthenticated(isAuth)
        setFirstTimeSetup(isFirstTime)
      } catch (error) {
        console.error('Error checking auth:', error)
        setIsAuthenticated(false)
        setFirstTimeSetup(isFirstTime)
      } finally {
        setIsCheckingAuth(false)
      }
    }

    checkAuth()
  }, [])

  // Fetch data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchReservations()
      fetchAvailableSlots()
    }
  }, [isAuthenticated])

  const fetchReservations = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getReservations()
      setReservations(data || [])
    } catch (err) {
      console.error('Error fetching reservations:', err)
      if (err.message && err.message.includes('Service key not configured')) {
        setError('Admin access requires a service key. Please configure VITE_SUPABASE_SERVICE_KEY in your .env.local file.')
      } else {
        setError('Failed to load reservations. Please try again later.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const fetchAvailableSlots = async () => {
    try {
      const slotsExist = await checkSlotsExist();
      setAvailableSlots(slotsExist ? 'Yes' : 'No');
    } catch (err) {
      console.error('Error checking slots:', err);
      setAvailableSlots('Error');
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setLoginForm(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSetupSubmit = async (e) => {
    e.preventDefault()
    setFormError('')

    const { password, confirmPassword } = loginForm

    // Validate password
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters long')
      return
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match')
      return
    }

    try {
      // Setup admin password
      setupAdminPassword(password)

      // Login automatically after setup
      const result = await loginAdmin(password)
      if (result.success) {
        setFirstTimeSetup(false)
        setIsAuthenticated(true)
      } else {
        setFormError('Error setting up admin account')
      }
    } catch (error) {
      console.error('Setup error:', error)
      setFormError('Error setting up: ' + error.message)
    }
  }

  const handleLoginSubmit = async (e) => {
    e.preventDefault()
    setFormError('')

    const { password } = loginForm

    try {
      // Login
      const result = await loginAdmin(password)
      if (result.success) {
        setIsAuthenticated(true)
      } else {
        setFormError(result.message || 'Invalid password')
      }
    } catch (error) {
      console.error('Login error:', error)
      setFormError('Login failed: ' + error.message)
    }
  }

  const handleLogout = () => {
    logoutAdmin()
    setIsAuthenticated(false)
  }

  const handleCreateTestSlots = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const slots = await createTestSlots();
      setSuccessMessage(`Created ${slots.length} test slots successfully!`);
      await fetchAvailableSlots();
    } catch (err) {
      console.error('Error creating test slots:', err);
      setError(err.message || 'Failed to create test slots. Make sure your service key is configured.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <LoadingSpinner />
      </div>
    )
  }

  if (firstTimeSetup) {
    return (
      <div className="max-w-md mx-auto mt-10 card">
        <div className="card-header">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Admin Setup</h2>
        </div>
        <div className="card-body">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Welcome! Please set up an admin password to continue.
          </p>

          {formError && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded">
              {formError}
            </div>
          )}

          <form onSubmit={handleSetupSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={loginForm.password}
                onChange={handleInputChange}
                className="input"
                required
                minLength={8}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Must be at least 8 characters long
              </p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={loginForm.confirmPassword}
                onChange={handleInputChange}
                className="input"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full btn-primary"
            >
              Set Password & Login
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto mt-10 card">
        <div className="card-header">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Admin Login</h2>
        </div>
        <div className="card-body">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Please enter your admin password to continue.
          </p>

          {formError && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded">
              {formError}
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={loginForm.password}
                onChange={handleInputChange}
                className="input"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full btn-primary"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-5">
        <div>
          <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">Admin Dashboard</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Manage reservations and system settings.
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="btn-secondary"
        >
          Logout
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-md text-red-600 dark:text-red-400">
          <p className="font-medium">Service Key Required</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2 text-sm">
            See the <code className="bg-red-100 dark:bg-red-800/50 px-1 py-0.5 rounded">dev-docs/supabase-setup.md</code> file for instructions.
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="card overflow-hidden">
              <div className="card-header bg-primary-50 dark:bg-primary-900/30">
                <h3 className="text-lg font-medium text-primary-800 dark:text-primary-300">Total Reservations</h3>
              </div>
              <div className="card-body">
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {error ? '--' : reservations.length}
                </p>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="card-header bg-primary-50 dark:bg-primary-900/30">
                <h3 className="text-lg font-medium text-primary-800 dark:text-primary-300">Today's Bookings</h3>
              </div>
              <div className="card-body">
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {error ? '--' :
                  reservations.filter(r => {
                    const today = new Date().toISOString().split('T')[0];
                    const bookingDate = new Date(r.created_at).toISOString().split('T')[0];
                    return bookingDate === today;
                  }).length}
                </p>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="card-header bg-primary-50 dark:bg-primary-900/30">
                <h3 className="text-lg font-medium text-primary-800 dark:text-primary-300">Available Slots</h3>
              </div>
              <div className="card-body">
                <p className="text-3xl font-bold text-gray-900 dark:text-white">{availableSlots}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="text-xl font-medium text-gray-900 dark:text-white">Recent Reservations</h3>
            </div>
            <div className="card-body">
              {error ? (
                <div className="text-center text-gray-600 dark:text-gray-400 py-4">
                  Configure service key to view reservations
                </div>
              ) : reservations.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Group</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                      {reservations.slice(0, 5).map((reservation) => (
                        <tr key={reservation.id}>
                          <td className="px-6 py-4 whitespace-nowrap">{reservation.user_name}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {new Date(reservation.slots?.start_time || '').toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {new Date(reservation.slots?.start_time || '').toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">{reservation.group_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center text-gray-600 dark:text-gray-400 py-4">
                  No reservations found
                </div>
              )}
            </div>
          </div>

          {/* Admin Actions */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card">
              <div className="card-header bg-primary-50 dark:bg-primary-900/30">
                <h3 className="text-lg font-medium text-primary-800 dark:text-primary-300">Quick Actions</h3>
              </div>
              <div className="card-body">
                <div className="grid grid-cols-1 gap-4">
                  <button
                    onClick={() => navigate('/admin/slots')}
                    className="w-full btn-primary"
                  >
                    Manage Available Slots
                  </button>

                  <button
                    onClick={handleCreateTestSlots}
                    className="w-full btn-secondary"
                    disabled={isLoading}
                  >
                    Create Test Slots
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}