import { useState, useEffect } from 'react'
import { getReservations, checkSlotsExist, createTestSlots, updateReservationStatus, adminSupabase } from '../lib/supabase'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  isFirstTimeSetup,
  setupAdminPassword,
  loginAdmin,
  logoutAdmin,
  isAdminAuthenticated
} from '../lib/authService'
import { useNavigate, Link } from 'react-router-dom'
import { sendStatusUpdateEmail } from '../lib/emailService'
import VerificationSettings from '../components/admin/VerificationSettings'
import { Tab, TabPanel, Tabs } from '../components/Tabs'

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [error, setError] = useState(null)
  const [reservations, setReservations] = useState([])
  const [availableSlots, setAvailableSlots] = useState('--')
  const [firstTimeSetup, setFirstTimeSetup] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [loginForm, setLoginForm] = useState({
    password: '',
    confirmPassword: ''
  })
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const navigate = useNavigate()
  const [statusUpdateModal, setStatusUpdateModal] = useState({
    isOpen: false,
    reservation: null,
    status: '',
    reason: ''
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [availableSlotsCount, setAvailableSlotsCount] = useState(0);
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: 'ascending'
  });
  const [selectedReservation, setSelectedReservation] = useState(null);

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
      fetchAvailableSlotsCount()
    }
  }, [isAuthenticated])

  const sortReservations = (reservations) => {
    if (!sortConfig.key) return reservations;

    return [...reservations].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Special handling for nested objects and dates
      if (sortConfig.key === 'slots') {
        aValue = new Date(a.slots?.start_time || '');
        bValue = new Date(b.slots?.start_time || '');
      } else if (sortConfig.key === 'user_name') {
        aValue = a.user_name?.toLowerCase();
        bValue = b.user_name?.toLowerCase();
      } else if (sortConfig.key === 'group_id') {
        aValue = a.group_id?.toLowerCase();
        bValue = b.group_id?.toLowerCase();
      } else if (sortConfig.key === 'status') {
        aValue = a.status?.toLowerCase();
        bValue = b.status?.toLowerCase();
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
  };

  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) {
      return (
        <svg className="w-4 h-4 ml-1 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return (
      <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortConfig.direction === 'ascending' ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
      </svg>
    );
  };

  const fetchReservations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getReservations();
      setReservations(sortReservations(data || []));
    } catch (err) {
      console.error('Error fetching reservations:', err);
      if (err.message && err.message.includes('Service key not configured')) {
        setError('Admin access requires a service key. Please configure VITE_SUPABASE_SERVICE_KEY in your .env.local file.');
      } else {
        setError('Failed to load reservations. Please try again later.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAvailableSlots = async () => {
    try {
      const slotsExist = await checkSlotsExist();
      setAvailableSlots(slotsExist ? 'Yes' : 'No');
    } catch (err) {
      console.error('Error checking slots:', err);
      setAvailableSlots('Error');
    }
  };

  const fetchAvailableSlotsCount = async () => {
    if (!adminSupabase) {
      console.error('Admin Supabase client not available');
      return;
    }

    try {
      const now = new Date();
      const { count, error } = await adminSupabase
        .from('slots')
        .select('*', { count: 'exact', head: true })
        .gte('start_time', now.toISOString())
        .eq('is_available', true);

      if (error) throw error;
      setAvailableSlotsCount(count || 0);
    } catch (err) {
      console.error('Error fetching available slots count:', err);
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

  const handleStatusUpdate = async (reservation, newStatus) => {
    setStatusUpdateModal({
      isOpen: true,
      reservation,
      status: newStatus,
      reason: ''
    });
  };

  const handleStatusUpdateSubmit = async () => {
    if (!statusUpdateModal.reservation || !statusUpdateModal.reason.trim()) {
      setError('Please provide a reason for the status change');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage('');

    try {
      // Update reservation status
      const updatedReservation = await updateReservationStatus(
        statusUpdateModal.reservation.id,
        statusUpdateModal.status,
        statusUpdateModal.reason
      );

      // Send notification email with better error handling
      try {
        const emailResult = await sendStatusUpdateEmail(
          updatedReservation,
          statusUpdateModal.status,
          statusUpdateModal.reason
        );

        if (!emailResult.success) {
          console.warn('Status update email could not be sent:', emailResult.error);
          // Still continue with the process but notify admin about email issue
          setSuccessMessage(
            `Reservation has been ${statusUpdateModal.status}, but the notification email could not be sent. ` +
            `Error: ${emailResult.error || 'Unknown error'}`
          );
        } else {
          setSuccessMessage(
            `Reservation has been ${statusUpdateModal.status}. Notification email sent successfully.`
          );
        }
      } catch (emailErr) {
        console.error('Error sending status update email:', emailErr);
        // Still continue with the process but notify admin about email issue
        setSuccessMessage(
          `Reservation has been ${statusUpdateModal.status}, but the notification email could not be sent. ` +
          `Error: ${emailErr.message || 'Unknown error'}`
        );
      }

      // Refresh reservations
      await fetchReservations();

      // Close the modal
      setStatusUpdateModal({ isOpen: false, reservation: null, status: '', reason: '' });
    } catch (err) {
      console.error('Error updating reservation status:', err);
      setError(err.message || 'Failed to update reservation status');
    } finally {
      setIsLoading(false);
      
      // Auto-hide success message after 8 seconds
      if (successMessage) {
        setTimeout(() => {
          setSuccessMessage('');
        }, 8000);
      }
    }
  };

  const handleDeleteReservation = async (reservation) => {
    if (!window.confirm('Are you sure you want to delete this reservation?')) return;

    setIsLoading(true);
    setError(null);
    setSuccessMessage('');

    try {
      const deletedReservation = await deleteReservation(reservation.id);

      // Send cancellation email
      await sendStatusUpdateEmail(deletedReservation, 'cancelled', 'Reservation was deleted by admin');

      // Refresh reservations
      await fetchReservations();

      setSuccessMessage('Reservation deleted successfully');
    } catch (err) {
      console.error('Error deleting reservation:', err);
      setError(err.message || 'Failed to delete reservation');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'cancelled':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
  };

  const isPastReservation = (reservation) => {
    const slotTime = new Date(reservation.slots?.start_time || '');
    return slotTime < new Date();
  };

  const getReservationRowClass = (reservation) => {
    const baseClass = 'transition-colors duration-200';
    if (isPastReservation(reservation)) {
      return `${baseClass} bg-gray-50/50 dark:bg-gray-800/50`;
    }
    return baseClass;
  };

  const formatTimeUntil = (reservation) => {
    const slotTime = new Date(reservation.slots?.start_time || '');
    const now = new Date();
    const diff = slotTime - now;

    if (diff < 0) {
      return 'Past';
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    return `${hours}h`;
  };

  const filterReservations = (reservations) => {
    if (!searchQuery.trim()) return reservations;

    const query = searchQuery.toLowerCase().trim();
    return reservations.filter(reservation => {
      const nameMatch = reservation.user_name?.toLowerCase().includes(query);
      const emailMatch = reservation.user_email?.toLowerCase().includes(query);
      const groupMatch = reservation.group_id?.toLowerCase().includes(query);
      return nameMatch || emailMatch || groupMatch;
    });
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
          <Tabs defaultTab="dashboard" onChange={(tab) => setActiveTab(tab)}>
            <Tab value="dashboard">Dashboard</Tab>
            <Tab value="reservations">Reservations</Tab>
            <Tab value="security">Security</Tab>
            
            <TabPanel value="dashboard" className="py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="card">
              <div className="card-header">
                <h3 className="text-xl font-medium text-gray-900 dark:text-white">Available Slots</h3>
              </div>
              <div className="card-body">
                <div className="text-4xl font-bold text-primary-600 dark:text-primary-400">
                  {availableSlotsCount}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Upcoming slots available for booking
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="text-xl font-medium text-gray-900 dark:text-white">Total Reservations</h3>
              </div>
              <div className="card-body">
                <div className="text-4xl font-bold text-primary-600 dark:text-primary-400">
                  {reservations.length}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Total number of reservations
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="text-xl font-medium text-gray-900 dark:text-white">Upcoming Reservations</h3>
              </div>
              <div className="card-body">
                <div className="text-4xl font-bold text-primary-600 dark:text-primary-400">
                  {reservations.filter(r => !isPastReservation(r) && r.status === 'confirmed').length}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Confirmed future reservations
                </div>
              </div>
            </div>
          </div>
            </TabPanel>
            
            <TabPanel value="reservations" className="py-4">

          <div className="card">
            <div className="card-header">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-medium text-gray-900 dark:text-white">Reservations</h3>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Showing {filterReservations(reservations).length} of {reservations.length} reservations
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <Link
                    to="/admin/slots"
                    className="btn-primary"
                  >
                    Manage Available Slots
                  </Link>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by name, email, or group..."
                      className="input pl-10 w-64"
                    />
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
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
                        <th
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                          onClick={() => handleSort('user_name')}
                        >
                          <div className="flex items-center">
                            Name
                            {getSortIcon('user_name')}
                          </div>
                        </th>
                        <th
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                          onClick={() => handleSort('slots')}
                        >
                          <div className="flex items-center">
                            Date & Time
                            {getSortIcon('slots')}
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Time Until
                        </th>
                        <th
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                          onClick={() => handleSort('group_id')}
                        >
                          <div className="flex items-center">
                            Group
                            {getSortIcon('group_id')}
                          </div>
                        </th>
                        <th
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                          onClick={() => handleSort('status')}
                        >
                          <div className="flex items-center">
                            Status
                            {getSortIcon('status')}
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                      {sortReservations(filterReservations(reservations)).map((reservation) => (
                        <tr
                          key={reservation.id}
                          className={`${getReservationRowClass(reservation)} cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800`}
                          onClick={() => setSelectedReservation(reservation)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  {reservation.user_name}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  {reservation.user_email}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {new Date(reservation.slots?.start_time || '').toLocaleDateString()}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {new Date(reservation.slots?.start_time || '').toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false
                              })}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              isPastReservation(reservation)
                                ? 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                            }`}>
                              {formatTimeUntil(reservation)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                              {reservation.group_id}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(reservation.status)}`}>
                              {reservation.status || 'pending'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            {!isPastReservation(reservation) && reservation.status !== 'cancelled' && (
                              <button
                                onClick={() => handleStatusUpdate(reservation, 'cancelled')}
                                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                              >
                                Cancel
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center text-gray-600 dark:text-gray-400 py-4">
                  {searchQuery ? 'No matching reservations found' : 'No reservations found'}
                </div>
              )}
            </div>
          </div>

          {successMessage && (
            <div className="p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-md text-green-600 dark:text-green-400">
              {successMessage}
            </div>
          )}
            </TabPanel>
            
            <TabPanel value="security" className="py-4">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Security Settings</h2>
                <p className="text-gray-500 dark:text-gray-400">
                  Manage human verification and rate limiting settings for the reservation system.
                </p>
              </div>
              
              <VerificationSettings />
              
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Security Information
                </h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-md font-medium text-gray-900 dark:text-white mb-2">
                      Human Verification
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      All users must complete a human verification challenge before making a reservation.
                      This helps prevent automated bots from abusing the reservation system.
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="text-md font-medium text-gray-900 dark:text-white mb-2">
                      Rate Limiting
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Users are limited to 5 booking attempts per hour to prevent abuse.
                      Administrators can reset rate limits for specific users if needed.
                    </p>
                  </div>
                  
                  <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-md p-4">
                    <p className="text-sm text-blue-700 dark:text-blue-400">
                      <strong>Note:</strong> These security measures help protect the system from abuse,
                      but should be monitored and adjusted based on user feedback and system usage patterns.
                    </p>
                  </div>
                </div>
              </div>
            </TabPanel>
          </Tabs>

          {/* Status Update Modal */}
          {statusUpdateModal.isOpen && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                <div className="p-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Cancel Reservation
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Reason for Cancellation
                      </label>
                      <textarea
                        value={statusUpdateModal.reason}
                        onChange={(e) => setStatusUpdateModal(prev => ({ ...prev, reason: e.target.value }))}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        rows={3}
                        placeholder="Please provide a reason for cancelling this reservation..."
                        required
                      />
                    </div>
                    {error && (
                      <div className="text-sm text-red-600 dark:text-red-400">
                        {error}
                      </div>
                    )}
                    <div className="flex justify-end space-x-3">
                      <button
                        onClick={() => {
                          setStatusUpdateModal({ isOpen: false, reservation: null, status: '', reason: '' });
                          setError(null);
                        }}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleStatusUpdateSubmit}
                        className="btn-primary"
                        disabled={isLoading}
                      >
                        {isLoading ? 'Cancelling...' : 'Confirm Cancellation'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Reservation Detail Modal */}
          {selectedReservation && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full">
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                      Reservation Details
                    </h3>
                    <button
                      onClick={() => setSelectedReservation(null)}
                      className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                    >
                      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</h4>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white">{selectedReservation.user_name}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</h4>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white">{selectedReservation.user_email}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Group</h4>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white">{selectedReservation.group_id}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</h4>
                        <span className={`mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(selectedReservation.status)}`}>
                          {selectedReservation.status || 'pending'}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Date</h4>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white">
                          {new Date(selectedReservation.slots?.start_time || '').toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Time</h4>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white">
                          {new Date(selectedReservation.slots?.start_time || '').toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                          })}
                        </p>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Time Until</h4>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white">
                        {formatTimeUntil(selectedReservation)}
                      </p>
                    </div>

                    {selectedReservation.notes && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">User Notes</h4>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                          {selectedReservation.notes}
                        </p>
                      </div>
                    )}

                    {selectedReservation.status === 'cancelled' && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Cancellation Reason</h4>
                        <p className="mt-1 text-sm text-gray-900 dark:text-white">
                          {selectedReservation.status_reason || 'No reason provided'}
                        </p>
                      </div>
                    )}

                    <div className="flex justify-end space-x-3 pt-4">
                      {!isPastReservation(selectedReservation) && selectedReservation.status !== 'cancelled' && (
                        <button
                          onClick={() => {
                            setSelectedReservation(null);
                            handleStatusUpdate(selectedReservation, 'cancelled');
                          }}
                          className="btn-secondary"
                        >
                          Cancel Reservation
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedReservation(null)}
                        className="btn-primary"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}