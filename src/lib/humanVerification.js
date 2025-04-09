/**
 * Human verification utility functions
 * Simple challenge-response verification system
 */

// Generate a random math challenge
export function generateMathChallenge() {
  // Generate two random numbers between 1 and 10
  const num1 = Math.floor(Math.random() * 10) + 1;
  const num2 = Math.floor(Math.random() * 10) + 1;
  
  // Create a simple addition challenge
  return {
    question: `What is ${num1} + ${num2}?`,
    answer: (num1 + num2).toString(),
    timestamp: Date.now()
  };
}

// Verify the user's answer to the challenge
export function verifyMathChallenge(challenge, userAnswer) {
  if (!challenge || !userAnswer) {
    return false;
  }
  
  // Check if the challenge is expired (valid for 5 minutes)
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  if (now - challenge.timestamp > fiveMinutes) {
    return { success: false, error: 'Verification expired. Please try again.' };
  }
  
  // Check if the answer is correct
  if (userAnswer.trim() === challenge.answer) {
    return { success: true };
  }
  
  return { success: false, error: 'Incorrect answer. Please try again.' };
}

// Generate a random image challenge
export function generateImageChallenge() {
  const challenges = [
    {
      question: 'Select the number of circles in this image: ○○○',
      answer: '3'
    },
    {
      question: 'Select the number of squares in this image: □□',
      answer: '2'
    },
    {
      question: 'Select the number of triangles in this image: △△△△',
      answer: '4'
    },
    {
      question: 'What shape is this? ○',
      answer: 'circle'
    },
    {
      question: 'What shape is this? □',
      answer: 'square'
    },
    {
      question: 'What shape is this? △',
      answer: 'triangle'
    }
  ];
  
  // Select a random challenge
  const randomIndex = Math.floor(Math.random() * challenges.length);
  const challenge = challenges[randomIndex];
  
  return {
    ...challenge,
    timestamp: Date.now()
  };
}

// Verify the user's answer to the image challenge
export function verifyImageChallenge(challenge, userAnswer) {
  if (!challenge || !userAnswer) {
    return { success: false, error: 'Invalid challenge or answer' };
  }
  
  // Check if the challenge is expired (valid for 5 minutes)
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  if (now - challenge.timestamp > fiveMinutes) {
    return { success: false, error: 'Verification expired. Please try again.' };
  }
  
  // Check if the answer is correct (case insensitive)
  if (userAnswer.trim().toLowerCase() === challenge.answer.toLowerCase()) {
    return { success: true };
  }
  
  return { success: false, error: 'Incorrect answer. Please try again.' };
}

// Get a random verification challenge (either math or image)
export function getRandomChallenge() {
  // Randomly choose between math and image challenge
  const useMathChallenge = Math.random() > 0.5;
  
  return useMathChallenge ? generateMathChallenge() : generateImageChallenge();
}

// Verify a challenge response based on its type
export function verifyChallenge(challenge, userAnswer) {
  if (!challenge) {
    return { success: false, error: 'Invalid challenge' };
  }
  
  // Determine the type of challenge and use the appropriate verification function
  if (challenge.question.includes('What is')) {
    return verifyMathChallenge(challenge, userAnswer);
  } else {
    return verifyImageChallenge(challenge, userAnswer);
  }
}
