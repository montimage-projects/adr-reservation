import { useState, useEffect } from 'react';
import { getRandomChallenge, verifyChallenge } from '../lib/humanVerification';

/**
 * Human verification component that presents a challenge to verify the user is human
 * @param {Object} props - Component props
 * @param {Function} props.onVerificationComplete - Callback when verification is complete (success or failure)
 * @param {boolean} props.isRequired - Whether verification is required
 */
export default function HumanVerification({ onVerificationComplete, isRequired = true }) {
  const [challenge, setChallenge] = useState(null);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Generate a new challenge when the component mounts
  useEffect(() => {
    generateNewChallenge();
  }, []);

  // Generate a new challenge
  const generateNewChallenge = () => {
    const newChallenge = getRandomChallenge();
    setChallenge(newChallenge);
    setAnswer('');
    setError('');
    setIsVerified(false);
  };

  // Handle answer input change
  const handleAnswerChange = (e) => {
    setAnswer(e.target.value);
    setError(''); // Clear any previous errors
  };

  // Submit the answer for verification
  const handleSubmit = () => {
    if (!answer.trim()) {
      setError('Please provide an answer');
      return;
    }

    setIsLoading(true);
    
    // Verify the answer
    const result = verifyChallenge(challenge, answer);
    
    if (result.success) {
      setIsVerified(true);
      setError('');
      onVerificationComplete({ success: true });
    } else {
      setError(result.error || 'Verification failed. Please try again.');
      generateNewChallenge(); // Generate a new challenge on failure
      onVerificationComplete({ success: false, error: result.error });
    }
    
    setIsLoading(false);
  };

  if (!isRequired && !challenge) {
    return null;
  }

  return (
    <div className="card mb-4">
      <div className="card-header">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          Human Verification
        </h3>
      </div>

      <div className="card-body">
        {isVerified ? (
          <div className="p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-md">
            <p className="text-sm text-green-600 dark:text-green-400">Verification successful!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-md">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Please complete this challenge to verify you're human:
              </label>
              <p className="text-md font-medium mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                {challenge?.question || 'Loading challenge...'}
              </p>
              <input
                type="text"
                value={answer}
                onChange={handleAnswerChange}
                placeholder="Your answer"
                className="input"
                disabled={isLoading || isVerified}
                required
              />
            </div>

            <div className="flex space-x-2">
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={handleSubmit}
                disabled={isLoading || isVerified}
              >
                {isLoading ? 'Verifying...' : 'Verify'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={generateNewChallenge}
                disabled={isLoading || isVerified}
              >
                New Challenge
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
