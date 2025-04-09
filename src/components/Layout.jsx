import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import { getClosestAvailableSlot, checkSlotsExist, createTestSlots } from '../lib/supabase';
import { isAdminAuthenticated } from '../lib/authService';
import { isUserAuthenticated, getCurrentUser } from '../lib/userService';

export default function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickBookLoading, setQuickBookLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isUser, setIsUser] = useState(false);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [isCheckingUser, setIsCheckingUser] = useState(true);
  const [userData, setUserData] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Check admin authentication status on route change
  useEffect(() => {
    const checkAuth = async () => {
      setIsCheckingAdmin(true);
      try {
        const isAuth = await isAdminAuthenticated();
        setIsAdmin(isAuth);
      } catch (error) {
        console.error('Error checking admin auth:', error);
        setIsAdmin(false);
      } finally {
        setIsCheckingAdmin(false);
      }
    };

    checkAuth();
  }, [location.pathname]);

  // Check user authentication status on route change
  useEffect(() => {
    const checkUserAuth = async () => {
      setIsCheckingUser(true);
      try {
        const isAuth = await isUserAuthenticated();
        setIsUser(isAuth);

        if (isAuth) {
          const user = getCurrentUser();
          setUserData(user);
        }
      } catch (error) {
        console.error('Error checking user auth:', error);
        setIsUser(false);
      } finally {
        setIsCheckingUser(false);
      }
    };

    checkUserAuth();
  }, [location.pathname]);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const handleQuickBook = async () => {
    setQuickBookLoading(true);
    try {
      // Check if there are any slots in the database
      const slotsExist = await checkSlotsExist();

      if (!slotsExist) {
        // No slots exist, offer to create test slots
        if (window.confirm('No available slots found. Would you like to create test slots for booking?')) {
          try {
            await createTestSlots();
            alert('Test slots created successfully! Trying to book the next available slot...');

            // Now try to get a slot again
            const slot = await getClosestAvailableSlot();
            if (slot) {
              sessionStorage.setItem('quickBookSlot', JSON.stringify(slot));
              navigate('/book?quick=true');
            } else {
              alert('Something went wrong with the created slots. Please try again.');
            }
          } catch (slotErr) {
            if (slotErr.message && slotErr.message.includes('Service key not configured')) {
              alert('Admin permissions required. Please add a service key in your .env.local file.');
            } else if (slotErr.code === '42501') {
              alert('Permission denied. Your application lacks necessary database permissions.');
            } else {
              alert(`Error creating test slots: ${slotErr.message || 'Unknown error'}`);
            }
          }
        }
      } else {
        // Slots exist, try to get the next available one
        const slot = await getClosestAvailableSlot();

        if (slot) {
          sessionStorage.setItem('quickBookSlot', JSON.stringify(slot));
          navigate('/book?quick=true');
        } else {
          if (window.confirm('All slots are currently booked. Would you like to create more test slots?')) {
            try {
              await createTestSlots();
              alert('Test slots created successfully! Please try booking again.');
            } catch (slotErr) {
              if (slotErr.message && slotErr.message.includes('Service key not configured')) {
                alert('Admin permissions required. Please add a service key in your .env.local file.');
              } else if (slotErr.code === '42501') {
                alert('Permission denied. Your application lacks necessary database permissions.');
              } else {
                alert(`Error creating test slots: ${slotErr.message || 'Unknown error'}`);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Error with quick booking:', err);
      alert('Failed to find an available slot. Please try again.');
    } finally {
      setQuickBookLoading(false);
      setMobileMenuOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 transition-colors duration-200">
      <nav className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <Link to="/" className="flex items-center">
                <svg
                  className="h-6 w-6 mr-2 text-primary-600 dark:text-primary-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <div className="flex flex-col">
                  <span className="text-xl font-bold text-primary-600 dark:text-primary-400">
                    Montimage ADR Lab
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Attack-Detect-Reaction Training
                  </span>
                </div>
              </Link>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  to="/"
                  className={`inline-flex items-center px-1 pt-1 border-b-2
                           ${location.pathname === '/'
                              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                              : 'border-transparent text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 hover:border-primary-500'}
                           transition-colors duration-200`}
                >
                  Home
                </Link>
                <Link
                  to="/book"
                  className={`inline-flex items-center px-1 pt-1 border-b-2
                           ${location.pathname === '/book'
                              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                              : 'border-transparent text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 hover:border-primary-500'}
                           transition-colors duration-200`}
                >
                  Book Slot
                </Link>

                {!isCheckingAdmin && isAdmin && (
                  <Link
                    to="/admin"
                    className={`inline-flex items-center px-1 pt-1 border-b-2
                             ${location.pathname === '/admin'
                                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                : 'border-transparent text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 hover:border-primary-500'}
                             transition-colors duration-200`}
                  >
                    Admin
                  </Link>
                )}

                <button
                  onClick={handleQuickBook}
                  disabled={quickBookLoading}
                  className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent
                           text-gray-700 dark:text-gray-300 hover:text-primary-600
                           dark:hover:text-primary-400 hover:border-primary-500
                           transition-colors duration-200"
                >
                  {quickBookLoading ? 'Finding slot...' : 'Quick Book'}
                </button>
              </div>
            </div>
            <div className="flex items-center">
              <ThemeToggle />

              {/* User Profile/Login Link (Desktop) */}
              <div className="hidden sm:flex ml-3">
                {!isCheckingUser && isUser ? (
                  <Link
                    to="/profile"
                    className={`inline-flex items-center px-3 py-1 rounded-md
                             ${location.pathname === '/profile'
                                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}
                             transition-colors duration-200`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                    {userData?.name?.split(' ')[0] || 'Profile'}
                  </Link>
                ) : (
                  <>
                    {!isCheckingAdmin && isAdmin && (
                      <Link
                        to="/admin"
                        className={`inline-flex items-center px-3 py-1 rounded-md
                                 ${location.pathname === '/admin'
                                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}
                                 transition-colors duration-200`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                        </svg>
                        Admin
                      </Link>
                    )}
                    <Link
                      to="/login"
                      className="inline-flex items-center px-3 py-1 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V3zm5 10v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 01-1 1H9a1 1 0 01-1-1z" clipRule="evenodd" />
                      </svg>
                      Sign In
                    </Link>
                  </>
                )}
              </div>

              {/* Mobile menu button */}
              <div className="sm:hidden ml-4">
                <button
                  onClick={toggleMobileMenu}
                  className="inline-flex items-center justify-center p-2 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
                  aria-expanded="false"
                >
                  <span className="sr-only">Open main menu</span>
                  {!mobileMenuOpen ? (
                    <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  ) : (
                    <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile menu, show/hide based on menu state */}
        {mobileMenuOpen && (
          <div className="sm:hidden">
            <div className="pt-2 pb-3 space-y-1">
              <Link
                to="/"
                className={`block pl-3 pr-4 py-2 border-l-4 ${
                  location.pathname === '/'
                    ? 'border-primary-500 text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Home
              </Link>
              <Link
                to="/book"
                className={`block pl-3 pr-4 py-2 border-l-4 ${
                  location.pathname === '/book'
                    ? 'border-primary-500 text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Book Slot
              </Link>

              {!isCheckingAdmin && isAdmin && (
                <Link
                  to="/admin"
                  className={`block pl-3 pr-4 py-2 border-l-4 ${
                    location.pathname === '/admin'
                      ? 'border-primary-500 text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Admin
                </Link>
              )}

              {/* User Profile/Login Link (Mobile) */}
              {!isCheckingUser && isUser ? (
                <Link
                  to="/profile"
                  className={`flex items-center pl-3 pr-4 py-2 border-l-4 ${
                    location.pathname === '/profile'
                      ? 'border-primary-500 text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                  My Profile
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="flex items-center pl-3 pr-4 py-2 border-l-4 border-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V3zm5 10v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 01-1 1H9a1 1 0 01-1-1z" clipRule="evenodd" />
                  </svg>
                  Sign In
                </Link>
              )}

              <button
                onClick={handleQuickBook}
                disabled={quickBookLoading}
                className="w-full text-left block pl-3 pr-4 py-2 border-l-4 border-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                {quickBookLoading ? 'Finding slot...' : 'Quick Book'}
              </button>
            </div>
          </div>
        )}
      </nav>
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <Outlet />
      </main>
      <footer className="bg-white dark:bg-gray-800 shadow-inner mt-8">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            &copy; {new Date().getFullYear()} Montimage - Attack-Detect-Reaction Lab Booking System
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Version {import.meta.env.VITE_APP_VERSION || '0.0.0'}
          </p>
        </div>
      </footer>
    </div>
  );
}