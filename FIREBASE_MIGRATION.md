# Migrating from Supabase to Firebase

This document outlines the steps needed to complete the migration from Supabase to Firebase for the ADR Reservation System.

## Prerequisites

1. Create a Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/)
2. Enable Firestore Database in your Firebase project
3. Enable Firebase Authentication with the Anonymous and Email/Password
   providers, and create the first admin as described in
   [`docs/auth-model.md`](docs/auth-model.md)

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

The rules live in [`firestore.rules`](firestore.rules) and the indexes in
[`firestore.indexes.json`](firestore.indexes.json). They follow the auth model
in [`docs/auth-model.md`](docs/auth-model.md): anonymous Firebase Auth for
visitors, email/password for admins, and an `admins/{uid}` allowlist. Deploy
both with:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Notes for existing data:

- Reservations made before #7 have no `user_uid`, so only admins can see them.
  Visitors see the reservations made from their own browser.
- Visitor cancellation is denied until #9 turns it into one batched write
  (delete the reservation and free the slot together). The rules already
  accept that batch; admins can still cancel.

See the README's *Testing* section for the emulator tests of these rules.

## Code Changes

The following files have been updated to use Firebase instead of Supabase:

1. `/src/lib/firebase.js` - New Firebase client and helper functions
2. `/src/lib/authService.js` - Updated to use Firebase Authentication
3. `/src/lib/userService.js` - Updated to use Firestore

## Testing

After setting up the new Firebase project:

1. Test all functionality in development environment:
   - Creating and managing slots
   - Making reservations
   - Admin functionality
   - User authentication

2. Verify new data:
   - Ensure reservations created in the new project are linked to their slots

## Rollback Plan

The Supabase project no longer exists, so there is no switching back. If the
Firebase release has problems, revert the migration commit on `main`; the
hosting provider redeploys the previous build.

## Cleanup

Done: the Supabase client, its dependencies and its configuration have been
removed. Delete any `VITE_SUPABASE_*` entries left in your local `.env.local`.
