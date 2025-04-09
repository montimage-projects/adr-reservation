import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { createReservation, verifySlotAvailability } from '../lib/supabase'
import { registerUser, getCurrentUser } from '../lib/userService'
import { sendBookingConfirmationEmail } from '../lib/emailService'
import LoadingSpinner from '../components/LoadingSpinner'
import Calendar from '../components/calendar/Calendar'
import SlotSelector from '../components/calendar/SlotSelector'
import CalendarIntegration from '../components/calendar/CalendarIntegration'
import QuickBook from '../components/QuickBook'
import { isSlotDisabled } from '../lib/calendarUtils'

export default function BookingPage() {
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    groupId: '',
    notes: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [confirmedBooking, setConfirmedBooking] = useState(null)
  const [isQuickLoading, setIsQuickLoading] = useState(false)
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
    const { id, value } = e.target
    setFormData(prev => ({
      ...prev,
      [id]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    try {
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
      }

      // Don't await this - we don't want to block the UI if email sending is slow
      sendBookingConfirmationEmail(bookingData)
        .then(emailResult => {
          if (!emailResult.success) {
            console.warn('Confirmation email could not be sent:', emailResult.error)
          } else {
            console.log('Confirmation email sent successfully')
          }
        })
        .catch(err => {
          console.error('Error sending confirmation email:', err)
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
                      Name
                    </label>
                    <input
                      type="text"
                      id="name"
                      required
                      value={formData.name}
                      onChange={handleInputChange}
                      className="input"
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Email
                    </label>
                    <input
                      type="email"
                      id="email"
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                      className="input"
                    />
                  </div>
                  <div>
                    <label htmlFor="groupId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Group ID
                    </label>
                    <input
                      type="text"
                      id="groupId"
                      required
                      value={formData.groupId}
                      onChange={handleInputChange}
                      className="input"
                    />
                  </div>
                  <div>
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Notes
                    </label>
                    <textarea
                      id="notes"
                      rows={3}
                      value={formData.notes}
                      onChange={handleInputChange}
                      className="input"
                    />
                  </div>
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