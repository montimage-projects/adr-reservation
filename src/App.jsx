import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Layout from './components/Layout'
import Home from './pages/Home'
import BookingPage from './pages/BookingPage'
import AdminPage from './pages/AdminPage'
import AdminSlotPage from './pages/AdminSlotPage'
import NotFound from './pages/NotFound'
import LoadingSpinner from './components/LoadingSpinner'
import { isAdminAuthenticated } from './lib/authService'
import { isUserAuthenticated } from './lib/userService'
import LoginPage from './pages/LoginPage'
import UserProfilePage from './pages/UserProfilePage'

// Admin Route Guard
const AdminRoute = ({ children }) => {
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true)
      try {
        const isAuth = await isAdminAuthenticated()
        setIsAdmin(isAuth)
      } catch (error) {
        console.error('Error checking admin auth:', error)
        setIsAdmin(false)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <LoadingSpinner />
      </div>
    )
  }

  if (!isAdmin) {
    // If user is not logged in, allow access to admin login page
    return <AdminPage />
  }

  // If admin is logged in, render the children
  return children
}

// User Route Guard
const UserRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true)
      try {
        const isAuth = await isUserAuthenticated()
        setIsAuthenticated(isAuth)
      } catch (error) {
        console.error('Error checking user auth:', error)
        setIsAuthenticated(false)
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [])

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <LoadingSpinner />
      </div>
    )
  }

  if (!isAuthenticated) {
    // Redirect to login with return URL
    return <Navigate to={`/login?returnUrl=${encodeURIComponent(window.location.pathname)}`} />
  }

  // If user is authenticated, render the children
  return children
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="book" element={<BookingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="profile" element={
          <UserRoute>
            <UserProfilePage />
          </UserRoute>
        } />
        <Route path="admin" element={
          <AdminRoute>
            <AdminPage />
          </AdminRoute>
        } />
        <Route path="admin/slots" element={
          <AdminRoute>
            <AdminSlotPage />
          </AdminRoute>
        } />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export default App
