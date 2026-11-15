# Migrating from Supabase to Firebase

This document describes how the ADR Reservation System runs on Firebase and
what is left to finish the move from Supabase.

## Status

- **Done in code (`firebase-migration` branch):** the app reads and writes
  Firestore, signs users in with Firebase Authentication, and ships with
  Firestore rules, indexes and a Vercel hosting config.
- **Pending (manual steps, see [Deployment](#deployment)):** the Vercel
  project and its environment variables, the first rules and indexes deploy,
  and the production cutover (#16, #17, #18). Until the cutover, production
  still runs from `main` on Netlify.
- **Pending (code):** the remaining Supabase files are removed in #19, after
  the cutover (see [Cleanup](#cleanup)).

## Prerequisites

1. Create a Firebase project at [https://console.firebase.google.com/](https://console.firebase.google.com/)
2. Enable Firestore Database in your Firebase project
3. Enable Firebase Authentication with the Anonymous and Email/Password
   providers, and create the first admin as described in
   [`docs/auth-model.md`](docs/auth-model.md#bootstrapping-the-first-admin-no-admin-sdk)
4. Install the Firebase CLI (`npm install -g firebase-tools`) and sign in with
   `firebase login` to deploy rules and indexes

## Configuration

Copy `.env.example` to `.env.local` and fill in the Firebase and EmailJS
values from your own projects:

```
# Firebase configuration
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_MEASUREMENT_ID=your-measurement-id

# EmailJS configuration
VITE_EMAILJS_SERVICE_ID=your-service-id
VITE_EMAILJS_PUBLIC_KEY=your-public-key
VITE_EMAILJS_CANCELLATION_TEMPLATE_ID=your-cancellation-template-id
VITE_EMAILJS_CONFIRMATION_TEMPLATE_ID=your-confirmation-template-id
```

The Firebase SDK is already a dependency, so `npm install` is all you need.

## Data Migration

No data is migrated. Firestore starts empty: slots, users, reservations and
settings are recreated in the new project rather than copied from Supabase.

## Auth model

The decision record is [`docs/auth-model.md`](docs/auth-model.md). In short:

- **Visitors** get an anonymous Firebase Auth session when the app loads. Their
  reservations carry `user_uid` and their profile lives at `users/{uid}`.
- **Admins** sign in with Firebase Auth email and password. A signed-in user is
  an admin only when an `admins/{uid}` document exists for them.
- There are no JWTs, custom claims, server functions or Admin SDK. Admins are
  created by hand in the Firebase console, as the decision record describes.

## Firestore rules and indexes

The rules live in [`firestore.rules`](firestore.rules) and the indexes in
[`firestore.indexes.json`](firestore.indexes.json); [`firebase.json`](firebase.json)
points the CLI at both. Read the files themselves rather than a copy here. The
rules follow the auth model above.

Deploy both to your project with:

```bash
firebase deploy --only firestore:rules,firestore:indexes --project <your-project-id>
```

The repository has no `.firebaserc`, so pass `--project` (or run
`firebase use --add` once to pick a default).

Notes for existing data:

- Reservations made before #7 have no `user_uid`, so only admins can see them.
  Visitors see the reservations made from their own browser.
- Booking runs as one transaction and visitor cancellation as one batched
  write that deletes the reservation and frees the slot (#9). The rules accept
  only those combined writes from visitors; admins can still cancel.

The emulator tests of these rules are described in the README's *Testing*
section (`npm run test:rules`).

## Code changes

The Firebase code lives in these files:

1. `src/lib/firebase.js` - Firebase client, the anonymous visitor session, and
   the Firestore helpers for slots and reservations
2. `src/lib/authService.js` - Admin sign-in with Firebase Auth email/password,
   plus the `admins/{uid}` check
3. `src/lib/userService.js` - Visitor profiles, reservation history and
   cancellation on Firestore

## Deployment

The target host is Vercel. [`vercel.json`](vercel.json) sends every route to
`index.html` so deep links work. Vercel builds the app with `npm run build`
(output in `dist/`). The GitHub Actions workflow only lints, tests and builds;
it never deploys.

These steps are done by hand in the Vercel and Firebase consoles and are
**still pending**:

1. **Vercel project (#16):** import the repository into Vercel and turn on
   preview deployments for pull requests.
2. **Environment and rules (#17):** add the `VITE_FIREBASE_*` and
   `VITE_EMAILJS_*` variables from [Configuration](#configuration) to the
   Vercel project, then deploy the rules and indexes as shown in
   [Firestore rules and indexes](#firestore-rules-and-indexes).
3. **Cutover (#18):** check the app on a Vercel preview, then move production
   from Netlify to Vercel.

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

Production keeps running from `main` on Netlify until the cutover, so nothing
needs rolling back before then. The rollback for the cutover itself belongs to
#18.

## Cleanup

The Supabase client and its npm dependencies have been removed. The
`supabase/` SQL folder and stale `.env.example` entries remain; #19 removes
them after the cutover. Delete any `VITE_SUPABASE_*` entries left in your local
`.env.local`.
