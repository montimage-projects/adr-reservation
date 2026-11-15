# Migrating from Supabase to Firebase

This document outlines the steps needed to complete the migration from Supabase to Firebase for the ADR Reservation System.

## Prerequisites

1. Create a Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/)
2. Enable Firestore Database in your Firebase project
3. Set up Firebase Authentication if you plan to use it

## Configuration Steps

1. Update your `.env.local` file with Firebase configuration values:

```
# Firebase configuration
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_MEASUREMENT_ID=your-measurement-id

# Keep existing configuration
VITE_JWT_SECRET=your-existing-jwt-secret

# Email.js configuration (unchanged)
VITE_EMAILJS_SERVICE_ID=your-service-id
VITE_EMAILJS_PUBLIC_KEY=your-public-key
VITE_EMAILJS_CANCELLATION_TEMPLATE_ID=adr_resevation_cancel
VITE_EMAILJS_CONFIRMATION_TEMPLATE_ID=adr_reservation_confirm
```

2. Install Firebase dependencies:

```bash
npm install firebase
```

## Data Migration

No data is migrated. Firestore starts empty: slots, users, reservations and
settings are recreated in the new project rather than copied from Supabase.

## Firestore Security Rules

Set up appropriate security rules in your Firebase console. Here's a starting point:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow admin access to everything
    match /{document=**} {
      allow read, write: if request.auth != null && request.auth.token.role == 'admin';
    }
    
    // Slots collection
    match /slots/{slotId} {
      // Anyone can read available slots
      allow read: if resource.data.is_available == true;
    }
    
    // Reservations collection
    match /reservations/{reservationId} {
      // Users can read their own reservations
      allow read: if request.auth != null && 
                   resource.data.user_email == request.auth.token.email;
                   
      // Anyone can create a reservation (we validate in the application)
      allow create: if true;
    }
    
    // Users collection
    match /users/{userId} {
      // Users can read and write their own data
      allow read, write: if request.auth != null && 
                          resource.data.email == request.auth.token.email;
    }
  }
}
```

## Code Changes

The following files have been updated to use Firebase instead of Supabase:

1. `/src/lib/firebase.js` - New Firebase client and helper functions
2. `/src/lib/authService.js` - Updated to use Firebase Authentication
3. `/src/lib/userService.js` - Updated to use Firestore

## Testing

After migration:

1. Test all functionality in development environment:
   - Creating and managing slots
   - Making reservations
   - Admin functionality
   - User authentication

2. Verify data integrity:
   - Ensure relationships between slots and reservations are maintained

## Rollback Plan

The Supabase project no longer exists, so there is no switching back. If the
Firebase release has problems, revert the migration commit on `main`; the
hosting provider redeploys the previous build.

## Cleanup

Done: the Supabase client, its dependencies and its configuration have been
removed. Delete any `VITE_SUPABASE_*` entries left in your local `.env.local`.
