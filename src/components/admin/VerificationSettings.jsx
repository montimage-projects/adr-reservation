import { useState, useEffect } from 'react';
import { clearRateLimit } from '../../lib/rateLimiter';

/**
 * Admin component for managing verification settings
 */
export default function VerificationSettings() {
  const [userEmail, setUserEmail] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });
  const [isLoading, setIsLoading] = useState(false);
  
  // Handle clearing rate limit for a specific user
  const handleClearRateLimit = () => {
    if (!userEmail || !userEmail.includes('@')) {
      setMessage({ 
        text: 'Please enter a valid email address', 
        type: 'error' 
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      clearRateLimit(userEmail);
      setMessage({ 
        text: `Rate limit cleared for ${userEmail}`, 
        type: 'success' 
      });
      setUserEmail('');
    } catch (error) {
      setMessage({ 
        text: `Error clearing rate limit: ${error.message}`, 
        type: 'error' 
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Clear message after 5 seconds
  useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => {
        setMessage({ text: '', type: '' });
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [message]);
  
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
        Verification Settings
      </h3>
      
      {message.text && (
        <div className={`mb-4 p-4 rounded-md ${
          message.type === 'success' 
            ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-400' 
            : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-400'
        }`}>
          <p className="text-sm">{message.text}</p>
        </div>
      )}
      
      <div className="space-y-6">
        <div>
          <h4 className="text-md font-medium text-gray-900 dark:text-white mb-2">
            Reset Rate Limit for User
          </h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Clear booking attempt limits for a specific user email.
          </p>
          
          <div className="flex space-x-2">
            <input
              type="email"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="user@example.com"
              className="input flex-1"
              disabled={isLoading}
            />
            <button
              onClick={handleClearRateLimit}
              disabled={isLoading}
              className="btn-primary"
            >
              {isLoading ? 'Processing...' : 'Clear Limit'}
            </button>
          </div>
        </div>
        
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <h4 className="text-md font-medium text-gray-900 dark:text-white mb-2">
            Current Verification Settings
          </h4>
          <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md">
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li className="flex justify-between">
                <span>Human verification:</span>
                <span className="font-medium">Enabled</span>
              </li>
              <li className="flex justify-between">
                <span>Rate limit window:</span>
                <span className="font-medium">1 hour</span>
              </li>
              <li className="flex justify-between">
                <span>Max booking attempts:</span>
                <span className="font-medium">5 per hour</span>
              </li>
            </ul>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Note: These settings can only be changed by editing the configuration files.
          </p>
        </div>
      </div>
    </div>
  );
}
