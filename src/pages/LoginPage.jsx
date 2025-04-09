import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Input,
  Button,
  Typography,
  Spinner
} from '@material-tailwind/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { registerUser, isUserAuthenticated } from '../lib/userService';

export default function LoginPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    groupId: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Check if user is already authenticated
  useEffect(() => {
    async function checkAuth() {
      const isAuth = await isUserAuthenticated();
      if (isAuth) {
        // Redirect to user profile if already logged in
        const returnUrl = searchParams.get('returnUrl') || '/profile';
        navigate(returnUrl);
      }
    }

    checkAuth();
  }, [navigate, searchParams]);

  // Handle form input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: value
    }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Simple validation
    if (!formData.name || !formData.email) {
      setError('Name and email are required');
      setLoading(false);
      return;
    }

    if (!formData.email.includes('@')) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    try {
      // Register user (will create new or update existing)
      const result = await registerUser(formData);
      if (result.success) {
        // Redirect to return URL or profile page
        const returnUrl = searchParams.get('returnUrl') || '/profile';
        navigate(returnUrl);
      } else {
        setError(result.error || 'Failed to log in. Please try again.');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again later.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4 py-12">
      <div className="w-full max-w-md">
        <Card className="shadow-xl hover:shadow-2xl transition-all duration-300 bg-white dark:bg-gray-800">
          <CardHeader
            variant="gradient"
            color="blue"
            className="mb-4 grid h-28 place-items-center relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-90 dark:from-blue-800 dark:to-indigo-800" />
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0YzAtMS4xLjktMiAyLTJzMiAuOSAyIDItLjkgMi0yIDItMi0yLS45LTItMnptLTI0IDBjMC0xLjEuOS0yIDItMnMyIC45IDIgMi0uOSAyLTIgMi0yLS45LTItMnptMjQgMjRjMC0xLjEuOS0yIDItMnMyIC45IDIgMi0uOSAyLTIgMi0yLS45LTItMnptLTI0IDBjMC0xLjEuOS0yIDItMnMyIC45IDIgMi0uOSAyLTIgMi0yLS45LTItMnptLTI0IDEyYzAtMS4xLjktMiAyLTJzMiAuOSAyIDItLjkgMi0yIDItMi0yLS45LTItMnptLTI0IDBjMC0xLjEuOS0yIDItMnMyIC45IDIgMi0uOSAyLTIgMi0yLS45LTItMnptMjQgMTJjMC0xLjEuOS0yIDItMnMyIC45IDIgMi0uOSAyLTIgMi0yLS45LTItMnptLTI0IDBjMC0xLjEuOS0yIDItMnMyIC45IDIgMi0uOSAyLTIgMi0yLS45LTItMnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-10" />
            <Typography variant="h3" color="white" className="relative z-10">
              Welcome Back
            </Typography>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardBody className="flex flex-col gap-6">
              <Typography variant="paragraph" className="text-center text-gray-600 dark:text-gray-300">
                Enter your details to access your reservations
              </Typography>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg relative animate-fade-in" role="alert">
                  <Typography variant="small">{error}</Typography>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <Typography variant="small" className="text-gray-700 dark:text-gray-300 font-medium">
                      Full Name
                    </Typography>
                    <span className="text-red-500 dark:text-red-400 text-sm">*</span>
                  </div>
                  <Input
                    name="name"
                    size="lg"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-400 [&>input]:pr-3"
                    containerProps={{
                      className: "min-w-0",
                    }}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <Typography variant="small" className="text-gray-700 dark:text-gray-300 font-medium">
                      Email Address
                    </Typography>
                    <span className="text-red-500 dark:text-red-400 text-sm">*</span>
                  </div>
                  <Input
                    name="email"
                    type="email"
                    size="lg"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-400 [&>input]:pr-3"
                    containerProps={{
                      className: "min-w-0",
                    }}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <Typography variant="small" className="text-gray-700 dark:text-gray-300 font-medium">
                      Group ID
                    </Typography>
                    <span className="text-gray-400 dark:text-gray-500 text-xs italic">(Optional)</span>
                  </div>
                  <Input
                    name="groupId"
                    size="lg"
                    value={formData.groupId}
                    onChange={handleChange}
                    className="focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-400 [&>input]:pr-3"
                    containerProps={{
                      className: "min-w-0",
                    }}
                  />
                </div>

                <div className="mt-2">
                  <Typography variant="small" className="text-gray-500 dark:text-gray-400 text-xs">
                    <span className="text-red-500 dark:text-red-400">*</span> Required fields
                  </Typography>
                </div>
              </div>
            </CardBody>

            <CardFooter className="pt-0">
              <Button
                variant="gradient"
                fullWidth
                type="submit"
                disabled={loading}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 dark:from-blue-700 dark:to-indigo-700 dark:hover:from-blue-600 dark:hover:to-indigo-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-blue-400 transition-all duration-200"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Spinner className="h-4 w-4" /> Signing In...
                  </div>
                ) : (
                  'Sign In'
                )}
              </Button>

              <Typography variant="small" className="mt-6 flex justify-center text-gray-600 dark:text-gray-300">
                Need to book a slot?
                <Link
                  to="/book"
                  className="ml-1 font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors duration-200"
                >
                  Book Now
                </Link>
              </Typography>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}