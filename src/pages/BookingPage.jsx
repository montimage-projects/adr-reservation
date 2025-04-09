import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { createReservation, verifySlotAvailability, getUserReservationCount } from '../lib/supabase'
import { registerUser, getCurrentUser } from '../lib/userService'
import { sendBookingConfirmationEmail } from '../lib/emailService'
import { checkRateLimit, recordAttempt, formatTimeUntilReset } from '../lib/rateLimiter'
import { validateBookingForm } from '../lib/validationUtils'
import LoadingSpinner from '../components/LoadingSpinner'
import Calendar from '../components/calendar/Calendar'
import SlotSelector from '../components/calendar/SlotSelector'
import CalendarIntegration from '../components/calendar/CalendarIntegration'
import QuickBook from '../components/QuickBook'
import HumanVerification from '../components/HumanVerification'
import { isSlotDisabled } from '../lib/calendarUtils'

export default function BookingPage() {
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    groupId: '',
    notes: ''
  })
  const [formErrors, setFormErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [confirmedBooking, setConfirmedBooking] = useState(null)
  const [isQuickLoading, setIsQuickLoading] = useState(false)
  const [isHumanVerified, setIsHumanVerified] = useState(false)
  const [rateLimitInfo, setRateLimitInfo] = useState(null)
  const [userReservationCount, setUserReservationCount] = useState(null)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // Try to load saved user data
  useEffect(() => {
    const userData = getCurrentUser()
    if (userData) {
      setFormData(prevData => ({
        ...prevData,
        name: userData.name || '',
        email: userData.email || '',
        groupId: userData.groupId || ''
      }))
      
      // Check reservation count if email is available
      if (userData.email) {
        checkUserReservationCount(userData.email)
      }
    }
  }, [])

  // Check for quick book parameter and load slot from session storage
  useEffect(() => {
    const isQuickBook = searchParams.get('quick') === 'true'

    if (isQuickBook) {
      setIsQuickLoading(true)

      try {
        const storedSlot = sessionStorage.getItem('quickBookSlot')
        if (storedSlot) {
          const slot = JSON.parse(storedSlot)

          // Clear the stored slot to avoid reselecting on refresh
          sessionStorage.removeItem('quickBookSlot')

          // Verify the slot is still available before selecting it
          verifySlotAvailability(slot.id).then(isAvailable => {
            if (isAvailable) {
              setSelectedSlot(slot)
            } else {
              setSubmitError('The slot is no longer available. Please select another time slot.')
            }
            setIsQuickLoading(false)
          }).catch(err => {
            console.error('Error verifying slot availability:', err)
            setSubmitError('Error verifying slot availability. Please try again.')
            setIsQuickLoading(false)
          })
        } else {
          setIsQuickLoading(false)
        }
      } catch (err) {
        console.error('Error processing quick book:', err)
        setIsQuickLoading(false)
      }
    }
  }, [searchParams])

  const handleSlotSelect = (slot) => {
    console.log('Slot selected in BookingPage:', slot)

    if (!slot || !slot.id) {
      console.error('Invalid slot object received:', slot)
      return
    }

    // Check if the slot is in the past or within the next hour
    if (isSlotDisabled(slot.start_time)) {
      setSubmitError('Cannot select a slot in the past or within the next hour. Please select a future time slot.')
      return
    }

    // If user manually selects a slot, remove the 'quick' parameter from URL
    if (searchParams.has('quick')) {
      // Use navigate instead of setSearchParams to completely reset the URL
      // This ensures the badge won't show up for manually selected slots
      navigate('/book', { replace: true })
    }

    // Verify the slot is still available before selecting it
    verifySlotAvailability(slot.id)
      .then(isAvailable => {
        if (isAvailable) {
          console.log('Slot is available, setting selected slot')
          setSelectedSlot(slot)
          setSubmitError(null) // Clear any previous errors
        } else {
          console.warn('Slot is no longer available')
          setSubmitError('This slot is no longer available. Please select another time slot.')
        }
      })
      .catch(err => {
        console.error('Error verifying slot availability:', err)
        setSubmitError('Error verifying slot availability. Please try again.')
      })
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    
    // Clear error for this field when user types
    if (formErrors[name]) {
      setFormErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
    
    // Check reservation count when email changes
    if (name === 'email' && value.trim() !== '') {
      checkUserReservationCount(value)
    }
  }
  
  // Check how many reservations the user already has
  const checkUserReservationCount = async (email) => {
    if (!email || email.trim() === '') return
    
    try {
      const result = await getUserReservationCount(email)
      if (result.success) {
        console.log('User reservation count:', result) // Debug log
        setUserReservationCount(result)
      }
    } catch (error) {
      console.error('Error checking user reservation count:', error)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)
    setFormErrors({})

    try {
      // Validate form inputs
      const validation = validateBookingForm(formData)
      if (!validation.success) {
        setSubmitError(validation.error)
        setFormErrors({ [validation.field]: validation.error })
        setSubmitting(false)
        return
      }
      
      // Check if human verification is completed
      if (!isHumanVerified) {
        setSubmitError('Please complete the human verification challenge before booking.')
        setSubmitting(false)
        return
      }
      
      // Check rate limiting based on email
      if (formData.email) {
        const rateLimit = checkRateLimit(formData.email)
        setRateLimitInfo(rateLimit)
        
        if (rateLimit.limited) {
          const resetTime = formatTimeUntilReset(rateLimit.timeUntilReset)
          setSubmitError(
            `You've reached the maximum number of booking attempts. Please try again in ${resetTime}.`
          )
          setSubmitting(false)
          return
        }
        
        // Check if user already has an active reservation
        const reservationCount = await getUserReservationCount(formData.email)
        setUserReservationCount(reservationCount)
        
        if (reservationCount.success && reservationCount.count >= 1) {
          setSubmitError(
            'You already have an active reservation. Please cancel your existing reservation before making a new one. You can manage your reservations in your profile page.'
          )
          setSubmitting(false)
          return
        }
      }
      
      // First, verify the slot is still available
      const isAvailable = await verifySlotAvailability(selectedSlot.id)

      if (!isAvailable) {
        setSubmitError(
          'This slot has just been booked by someone else. Please select another time slot.'
        )
        setSelectedSlot(null) // Clear selection so user must choose another
        setSubmitting(false)
        return
      }

      // Register or update user in the system
      const userData = {
        name: formData.name,
        email: formData.email,
        groupId: formData.groupId
      }

      // Record this attempt for rate limiting
      if (formData.email) {
        recordAttempt(formData.email)
      }

      const registrationResult = await registerUser(userData)

      if (!registrationResult.success) {
        throw new Error(registrationResult.error || 'Failed to register user')
      }

      // If available, proceed with booking
      const reservationData = await createReservation(selectedSlot.id, formData)

      // Send confirmation email
      const bookingData = {
        userData: formData,
        slot: selectedSlot,
        reference: reservationData.reference
      };

      // Use Promise.race to set a timeout for email sending
      // This ensures we don't block the UI but still handle errors appropriately
      const emailTimeout = new Promise(resolve => {
        setTimeout(() => {
          resolve({ success: true, delayed: true });
        }, 3000); // 3 second timeout
      });

      // Start email sending in background but don't wait for it
      Promise.race([sendBookingConfirmationEmail(bookingData), emailTimeout])
        .then(emailResult => {
          if (emailResult.delayed) {
            console.log('Email confirmation is taking longer than expected, continuing in background');
            // The actual email sending continues in the background
            return;
          }
          
          if (!emailResult.success) {
            console.warn('Confirmation email could not be sent:', emailResult.error);
            // We could show a toast notification here if needed
          } else {
            console.log('Confirmation email sent successfully');
          }
        })
        .catch(err => {
          console.error('Error sending confirmation email:', err);
        })

      // Store the confirmed booking details for calendar integration
      setConfirmedBooking({
        slot: selectedSlot,
        userData: formData,
        reference: reservationData.reference
      })

      setSubmitSuccess(true)
    } catch (err) {
      console.error('Booking error:', err)

      // Handle specific permissions errors
      if (err.message && err.message.includes('Service key not configured')) {
        setSubmitError(
          'Admin permissions required. Please add a service key in your .env.local file to complete bookings.'
        )
      } else if (err.code === '42501') {
        setSubmitError(
          'Permission denied. The application lacks necessary database permissions for completing bookings.'
        )
      } else {
        setSubmitError(
          err.message || 'There was an error creating your booking. Please try again.'
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelBooking = () => {
    setSelectedSlot(null)
    setSubmitError(null)
  }

  if (submitSuccess) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="card">
          <div className="card-body text-center">
            <div className="mb-4 text-primary-500">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-white">Booking Confirmed!</h2>
            <p className="mt-2 text-gray-600 dark:text-gray-300">Thank you for your reservation.</p>

            {confirmedBooking && confirmedBooking.reference && (
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-gray-500 dark:text-gray-400 text-sm">Booking Reference</p>
                <p className="text-lg font-semibold">{confirmedBooking.reference}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  A confirmation email has been sent to {formData.email}
                </p>
              </div>
            )}

            <div className="mt-6 flex justify-center space-x-4">
              <button
                onClick={() => navigate('/profile')}
                className="btn-secondary"
              >
                View My Profile
              </button>

              <button
                onClick={() => {
                  setSubmitSuccess(false)
                  setSelectedSlot(null)
                  setConfirmedBooking(null)
                  // Reset URL when booking another slot
                  navigate('/book', { replace: true })
                }}
                className="btn-primary"
              >
                Book Another Slot
              </button>
            </div>
          </div>
        </div>

        {confirmedBooking && (
          <CalendarIntegration
            slot={confirmedBooking.slot}
            userData={confirmedBooking.userData}
          />
        )}
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {rateLimitInfo && rateLimitInfo.remainingAttempts < 3 && !rateLimitInfo.limited && (
        <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-md">
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            <strong>Note:</strong> You have {rateLimitInfo.remainingAttempts} booking {rateLimitInfo.remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining. 
            Please ensure your booking details are correct before submitting.
          </p>
        </div>
      )}
      <div className="border-b border-gray-200 dark:border-gray-700 pb-5 mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Book a Slot</h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Select an available time slot to make your reservation.
        </p>

        {!selectedSlot && !isQuickLoading && (
          <div className="mt-4">
            <QuickBook showTestOptions={true} />
          </div>
        )}

        {isQuickLoading && (
          <div className="mt-4 flex items-center text-primary-600 dark:text-primary-400">
            <LoadingSpinner size="small" />
            <span className="ml-2">Loading closest available slot...</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Calendar
            onSlotSelect={handleSlotSelect}
            initialSelectedSlot={selectedSlot}
          />
        </div>

        <div className="space-y-6">
          <SlotSelector selectedSlot={selectedSlot} />

          {selectedSlot && (
            <div className="card">
              <div className="card-header">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Complete Your Booking
                </h3>
              </div>

              <div className="card-body">
                {submitError && (
                  <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-md">
                    <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
                  </div>
                )}

                <form id="booking-form" onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Full Name
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      className={`input ${formErrors.name ? 'border-red-500 dark:border-red-400' : ''}`}
                    />
                    {formErrors.name && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">{formErrors.name}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Email
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      className={`input ${formErrors.email ? 'border-red-500 dark:border-red-400' : ''}`}
                    />
                    {formErrors.email && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">{formErrors.email}</p>
                    )}
                    {userReservationCount && userReservationCount.success && (
                      <div>
                        <p className={`mt-1 text-sm ${userReservationCount.count >= 1 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                          {userReservationCount.count === 0 
                            ? 'No active reservations' 
                            : `You already have ${userReservationCount.count} active ${userReservationCount.count === 1 ? 'reservation' : 'reservations'} (maximum: 1)`}
                        </p>
                        {userReservationCount.count >= 1 && (
                          <div className="mt-2">
                            <Link 
                              to="/profile" 
                              className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              View & Manage Your Reservations
                            </Link>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label htmlFor="groupId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Group ID (optional)
                    </label>
                    <input
                      type="text"
                      id="groupId"
                      name="groupId"
                      value={formData.groupId}
                      onChange={handleInputChange}
                      className={`input ${formErrors.groupId ? 'border-red-500 dark:border-red-400' : ''}`}
                    />
                    {formErrors.groupId && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">{formErrors.groupId}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Notes (optional)
                    </label>
                    <textarea
                      id="notes"
                      name="notes"
                      value={formData.notes}
                      onChange={handleInputChange}
                      rows={3}
                      className={`input ${formErrors.notes ? 'border-red-500 dark:border-red-400' : ''}`}
                      maxLength={500}
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {formData.notes.length}/500 characters
                    </p>
                    {formErrors.notes && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">{formErrors.notes}</p>
                    )}
                  </div>
                  
                  {/* Human Verification Component */}
                  <HumanVerification 
                    onVerificationComplete={(result) => {
                      setIsHumanVerified(result.success);
                      if (!result.success && result.error) {
                        setSubmitError(result.error);
                      }
                    }}
                  />
                </form>
              </div>

              <div className="card-footer flex space-x-2">
                <button
                  type="submit"
                  form="booking-form"
                  disabled={submitting}
                  className="btn-primary flex-1 flex justify-center items-center"
                  onClick={handleSubmit}
                >
                  {submitting ? (
                    <>
                      <LoadingSpinner />
                      <span className="ml-2">Confirming...</span>
                    </>
                  ) : (
                    'Confirm Booking'
                  )}
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCancelBooking}
                  disabled={submitting}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}