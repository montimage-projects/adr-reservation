import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Typography,
  Button,
  Avatar,
  Tabs,
  TabsHeader,
  TabsBody,
  Tab,
  TabPanel,
  Chip,
  Dialog,
  DialogHeader,
  DialogBody,
  DialogFooter,
  Menu,
  MenuHandler,
  MenuList,
  MenuItem,
} from '@material-tailwind/react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { getCurrentUser, getUserReservations, isUserAuthenticated, logoutUser, cancelReservation } from '../lib/userService';
import { formatDateTime } from '../utils/dateUtils';
import CalendarIntegration from '../components/calendar/CalendarIntegration';

export default function UserProfilePage() {
  const [user, setUser] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadUserData() {
      setLoading(true);

      // Check if user is authenticated
      const isAuth = await isUserAuthenticated();
      setAuthenticated(isAuth);

      if (isAuth) {
        // Load user data
        const userData = getCurrentUser();
        setUser(userData);

        // Load user reservations if user is found
        if (userData && userData.email) {
          const result = await getUserReservations(userData.email);
          if (result.success) {
            // Process the reservations data
            const processedReservations = result.reservations.map(reservation => {
              // Check if reservation.slots exists and has the expected structure
              if (reservation.slots && typeof reservation.slots === 'object') {
                return reservation;
              } else {
                console.error('Unexpected slots data format:', reservation.slots);
                return null;
              }
            }).filter(Boolean); // Remove any nulls

            setReservations(processedReservations);
          } else {
            console.error('Failed to load reservations:', result.error);
          }
        }
      }

      setLoading(false);
    }

    loadUserData();
  }, []);

  // Handle user logout
  const handleLogout = () => {
    logoutUser();
    setAuthenticated(false);
  };

  // Handle booking a new slot
  const handleBookNewSlot = () => {
    navigate('/book');
  };

  const handleCancelReservation = async (reservation) => {
    setSelectedReservation(reservation);
    setCancelDialogOpen(true);
  };

  const confirmCancelReservation = async () => {
    if (!selectedReservation) return;

    setCancelling(true);
    try {
      const result = await cancelReservation(selectedReservation.id);
      if (result.success) {
        // Update the reservations list
        setReservations(prev => prev.filter(r => r.id !== selectedReservation.id));
      } else {
        console.error('Failed to cancel reservation:', result.error);
      }
    } catch (error) {
      console.error('Error cancelling reservation:', error);
    } finally {
      setCancelling(false);
      setCancelDialogOpen(false);
      setSelectedReservation(null);
    }
  };

  // Redirect to login if not authenticated
  if (authenticated === false) {
    return <Navigate to="/login" />;
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-4xl mx-auto mb-6">
        <CardHeader
          floated={false}
          shadow={false}
          className="m-0 p-6 bg-blue-500 text-white"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Avatar
                size="lg"
                variant="circular"
                className="border-2 border-white"
                alt={user?.name || 'User'}
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=random`}
              />
              <div>
                <Typography variant="h5" className="mb-1">
                  {user?.name || 'Guest User'}
                </Typography>
                <Typography variant="small" className="font-normal opacity-80">
                  {user?.email || 'No email provided'}
                </Typography>
              </div>
            </div>
            <Button
              color="white"
              size="sm"
              variant="outlined"
              onClick={handleLogout}
            >
              Logout
            </Button>
          </div>
        </CardHeader>

        <CardBody className="p-0">
          <Tabs value={activeTab} onChange={(value) => setActiveTab(value)}>
            <TabsHeader
              className="bg-transparent border-b border-gray-200 dark:border-gray-700 rounded-none"
              indicatorProps={{
                className: "bg-transparent border-b-2 border-primary-500 shadow-none rounded-none",
              }}
            >
              <Tab
                value="profile"
                className="text-sm font-medium px-6 py-3 transition-all duration-300"
                activeClassName="text-primary-600 dark:text-primary-400"
                inactiveClassName="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                  Profile
                </div>
              </Tab>
              <Tab
                value="reservations"
                className="text-sm font-medium px-6 py-3 transition-all duration-300"
                activeClassName="text-primary-600 dark:text-primary-400"
                inactiveClassName="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                  </svg>
                  My Reservations
                </div>
              </Tab>
            </TabsHeader>
            <TabsBody className="p-6 bg-white dark:bg-gray-800">
              <TabPanel value="profile">
                <div className="space-y-4">
                  <div className="border rounded p-4">
                    <Typography variant="h6" className="mb-2">
                      Personal Information
                    </Typography>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Typography variant="small" className="text-gray-500">
                          Full Name
                        </Typography>
                        <Typography>{user?.name || 'Not provided'}</Typography>
                      </div>
                      <div>
                        <Typography variant="small" className="text-gray-500">
                          Email
                        </Typography>
                        <Typography>{user?.email || 'Not provided'}</Typography>
                      </div>
                      <div>
                        <Typography variant="small" className="text-gray-500">
                          Group ID
                        </Typography>
                        <Typography>{user?.groupId || 'Not provided'}</Typography>
                      </div>
                    </div>
                  </div>

                  <div className="border rounded p-4">
                    <Typography variant="h6" className="mb-2">
                      Account Summary
                    </Typography>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="border rounded-lg p-3 text-center">
                        <Typography className="text-2xl font-bold">
                          {reservations.length}
                        </Typography>
                        <Typography variant="small" className="text-gray-500">
                          Total Reservations
                        </Typography>
                      </div>

                      <div className="border rounded-lg p-3 text-center">
                        <Typography className="text-2xl font-bold">
                          {reservations.filter(r => {
                            const slotDate = r.slots.date || r.slots.start_time?.split('T')[0];
                            const slotTime = r.slots.start_time?.includes('T')
                              ? r.slots.start_time.split('T')[1]
                              : r.slots.start_time;
                            const dateTimeString = slotDate && slotTime
                              ? `${slotDate} ${slotTime}`
                              : r.slots.start_time;
                            return new Date(dateTimeString) > new Date();
                          }).length}
                        </Typography>
                        <Typography variant="small" className="text-gray-500">
                          Upcoming Reservations
                        </Typography>
                      </div>

                      <div className="border rounded-lg p-3 text-center">
                        <Typography className="text-2xl font-bold">
                          {reservations.filter(r => {
                            const slotDate = r.slots.date || r.slots.start_time?.split('T')[0];
                            const slotTime = r.slots.start_time?.includes('T')
                              ? r.slots.start_time.split('T')[1]
                              : r.slots.start_time;
                            const dateTimeString = slotDate && slotTime
                              ? `${slotDate} ${slotTime}`
                              : r.slots.start_time;
                            return new Date(dateTimeString) < new Date();
                          }).length}
                        </Typography>
                        <Typography variant="small" className="text-gray-500">
                          Past Reservations
                        </Typography>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <Button
                      onClick={handleBookNewSlot}
                      color="blue"
                      className="mr-2"
                    >
                      Book New Slot
                    </Button>
                  </div>
                </div>
              </TabPanel>

              <TabPanel value="reservations">
                {reservations.length > 0 ? (
                  <div className="space-y-4">
                    {reservations.map((reservation) => {
                      // Make sure the reservation.slots object exists
                      if (!reservation.slots || typeof reservation.slots !== 'object') {
                        console.error('Invalid reservation data:', reservation);
                        return null;
                      }

                      const slotDate = reservation.slots.date || reservation.slots.start_time?.split('T')[0];
                      const slotTime = reservation.slots.start_time?.includes('T')
                        ? reservation.slots.start_time.split('T')[1]
                        : reservation.slots.start_time;

                      const dateTimeString = slotDate && slotTime
                        ? `${slotDate} ${slotTime}`
                        : reservation.slots.start_time;

                      const slotDateTime = new Date(dateTimeString);
                      const isPast = slotDateTime < new Date();

                      return (
                        <Card
                          key={reservation.id}
                          className={`p-4 shadow-sm hover:shadow-md transition-shadow bg-white dark:bg-gray-800 border-l-4 ${
                            isPast
                              ? 'border-gray-300 dark:border-gray-600'
                              : 'border-primary-500 dark:border-primary-400'
                          }`}
                        >
                          <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Typography variant="h6" className="text-primary-600 dark:text-primary-400">
                                  {formatDateTime(slotDateTime)}
                                </Typography>
                                <Chip
                                  size="sm"
                                  variant="filled"
                                  color={isPast ? "gray" : "green"}
                                  value={isPast ? "Past" : "Upcoming"}
                                  className={`${
                                    isPast
                                      ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                  }`}
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <Typography variant="small" className="text-gray-500 dark:text-gray-400">
                                    Duration
                                  </Typography>
                                  <Typography className="text-gray-900 dark:text-white">
                                    {reservation.slots.duration || 60} minutes
                                  </Typography>
                                </div>
                                <div>
                                  <Typography variant="small" className="text-gray-500 dark:text-gray-400">
                                    Booking Reference
                                  </Typography>
                                  <Typography className="text-gray-900 dark:text-white">
                                    {reservation.reference || 'N/A'}
                                  </Typography>
                                </div>
                                <div>
                                  <Typography variant="small" className="text-gray-500 dark:text-gray-400">
                                    Booked on
                                  </Typography>
                                  <Typography className="text-gray-900 dark:text-white">
                                    {new Date(reservation.created_at).toLocaleDateString()}
                                  </Typography>
                                </div>
                                <div>
                                  <Typography variant="small" className="text-gray-500 dark:text-gray-400">
                                    Group ID
                                  </Typography>
                                  <Typography className="text-gray-900 dark:text-white">
                                    {reservation.group_id || 'N/A'}
                                  </Typography>
                                </div>
                              </div>

                              {reservation.notes && (
                                <div className="mt-2">
                                  <Typography variant="small" className="text-gray-500 dark:text-gray-400">
                                    Notes
                                  </Typography>
                                  <Typography className="text-sm text-gray-900 dark:text-white">
                                    {reservation.notes}
                                  </Typography>
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col gap-2 mt-2 md:mt-0">
                              {!isPast && (
                                <>
                                  <Button
                                    color="red"
                                    size="sm"
                                    variant="text"
                                    className="hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
                                    onClick={() => handleCancelReservation(reservation)}
                                    disabled={cancelling}
                                  >
                                    Cancel Reservation
                                  </Button>

                                  <CalendarIntegration
                                    slot={reservation.slots}
                                    userData={{
                                      name: user?.name || 'User',
                                      groupId: reservation.group_id,
                                      notes: reservation.notes
                                    }}
                                  />
                                </>
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Typography variant="h6" className="mb-2 text-gray-900 dark:text-white">
                      No Reservations Found
                    </Typography>
                    <Typography className="text-gray-500 dark:text-gray-400 mb-4">
                      You haven't made any reservations yet.
                    </Typography>
                    <Button onClick={handleBookNewSlot} color="blue">
                      Book Your First Slot
                    </Button>
                  </div>
                )}
              </TabPanel>
            </TabsBody>
          </Tabs>
        </CardBody>
      </Card>

      <Dialog
        open={cancelDialogOpen}
        handler={() => setCancelDialogOpen(false)}
        className="bg-white dark:bg-gray-800"
      >
        <DialogHeader className="text-gray-900 dark:text-white">
          Cancel Reservation
        </DialogHeader>
        <DialogBody className="text-gray-700 dark:text-gray-300">
          Are you sure you want to cancel this reservation?
          <div className="mt-4">
            <Typography variant="small" className="text-gray-500 dark:text-gray-400">
              Date & Time
            </Typography>
            <Typography className="text-gray-900 dark:text-white">
              {selectedReservation && formatDateTime(new Date(selectedReservation.slots.start_time))}
            </Typography>
          </div>
        </DialogBody>
        <DialogFooter className="gap-2">
          <Button
            variant="text"
            color="gray"
            onClick={() => setCancelDialogOpen(false)}
            className="mr-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Keep Reservation
          </Button>
          <Button
            color="red"
            onClick={confirmCancelReservation}
            disabled={cancelling}
            className="bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white"
          >
            {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}