# Auth model for Firestore access

Status: **decided** (issue #5, task 2.1 of the Firebase migration, epic #1).
Implemented by #6 (admin sign-in and removal of the client-side JWTs), #7
(Firestore rules rewrite) and #9 (atomic booking). See *Follow-up work and
owners* for who owns which piece.

## Context

The draft `firestore.rules` checks `request.auth` and a `role` custom claim,
but the app never signs in to Firebase Auth:

- nothing calls `signInAnonymously` or `onAuthStateChanged`, and `signIn()` in
  `src/lib/firebase.js` has no callers;
- admin login (`src/lib/authService.js`) compares a 32-bit client-side hash
  stored in `settings/admin_password_hash` and signs a JWT in the browser with
  a secret shipped in the bundle;
- visitor "sessions" (`src/lib/userService.js`) are also browser-signed JWTs in
  `localStorage`.

So `request.auth` is always `null`, no request carries the admin claim, and
every rule that needs an identity denies the app's own calls. Only two kinds of
request get through: public reads of available slots, and reservation creates,
which the draft opens with `allow create: if true`. So today a booking writes
the reservation but cannot mark its slot unavailable.

## Decision

| Caller | Identity | How |
|--------|----------|-----|
| Visitor (booker) | Firebase **anonymous** auth | `signInAnonymously()` on app load when there is no current user |
| Admin | Firebase Auth **email/password** | `signInWithEmailAndPassword()` on the admin login form |

A signed-in user is an **admin when the document `admins/{uid}` exists**. Rules
check it with:

```
function isSignedIn() {
  return request.auth != null;
}

function isAdmin() {
  return isSignedIn()
    && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
}
```

No custom claims, no server-side functions, no Admin SDK. Firebase Auth stores
and hashes the admin password, which replaces the client-side JWT admin flow
(#6 implements that).

### Rationale

- **No backend.** The app is a static site. This model needs only the client
  SDK, the Firebase console and security rules, so there is no server to
  deploy, patch or secure.
- **No service-account key.** Custom claims and server functions both need the
  Admin SDK, which needs a privileged credential somewhere. The allowlist is
  edited in the Firebase console, so no such credential has to exist outside
  Google.
- **Instant revocation.** Deleting `admins/{uid}` removes admin rights on the
  next request. A custom claim stays in the user's ID token until it refreshes
  (up to an hour).
- **Real password handling.** Firebase Auth hashes and verifies the admin
  password server-side, which meets #6's goals: no signing secret in the
  bundle, no weak hash, no in-app setup that can overwrite the password.
- **Every request has an identity.** Anonymous auth gives each visitor a stable
  `request.auth.uid`, so rules can scope reads, cancellations and profile
  writes to their owner instead of allowing them to everyone.

Cost: each rule evaluation that calls `exists()` or `get()` is billed as one
document read. Admin traffic is low, so this is negligible.

### Rejected options

| Option | Why rejected |
|--------|--------------|
| **Custom claims** (`request.auth.token.role == 'admin'`) | Setting a claim needs the Admin SDK (`setCustomUserClaims`) on a trusted server or a local script holding a service-account key. That is either a backend this project does not have or a privileged credential to manage by hand. Revocation waits for the ID token to refresh. |
| **Server-side functions with the Admin SDK** (Cloud Functions or hosting-provider functions) | Adds a backend to build, deploy and secure, plus a service-account secret. Cloud Functions also need the paid Blaze plan. The Admin SDK bypasses rules, so all authorization would move into hand-written function code, and every data call in the app would be rewritten. Atomic booking and the one-reservation limit can be handled with client transactions and rules instead (#9, #7). |
| **No auth; open rules for the specific unauthenticated operations** | Rules could not tell one visitor from another, so anyone could read, cancel or overwrite any reservation or profile. |

## Identities in the rules

- **Anyone**, including a browser whose anonymous sign-in has not finished:
  `request.auth` may be `null`.
- **Visitor**: `isSignedIn() && !isAdmin()`. Normally an anonymous user.
- **Admin**: `isAdmin()`.

Never treat "not anonymous" or "has an email" as admin. While the
Email/Password provider is enabled, anyone can create an email/password
account from the client SDK (`createUserWithEmailAndPassword`). Admin rights
come **only** from the `admins/{uid}` document.

The `admins` collection itself:

```
match /admins/{adminId} {
  allow read: if isSignedIn() && request.auth.uid == adminId; // the UI checks its own status
  allow write: if false;                                       // console only
}
```

Writes made in the Firebase console are not subject to security rules, so the
console remains able to manage the allowlist.

## Bootstrapping the first admin (no Admin SDK)

1. Firebase console → Authentication → Sign-in method: enable **Anonymous** and
   **Email/Password**.
2. Authentication → Users → **Add user**: enter the admin's email and a strong
   password. Copy the new user's **UID**.
3. Firestore → start a collection `admins` → add a document whose **document
   ID is that UID**. Its fields are informational only (for example `email`
   and `created_at`); the rules check existence, not content.
4. The admin signs in on the admin page with that email and password.

Add more admins the same way. To revoke one, delete their `admins/{uid}`
document (and disable or delete the Auth user if they should not sign in at
all). There is no in-app "first-time setup": #6 removes `isFirstTimeSetup()` /
`setupAdminPassword()` and the `settings/admin_password_hash` document.

## Linking visitors to their reservations

**Recommendation: link by anonymous uid.** Reservations store
`user_uid: request.auth.uid` next to `user_email`. Profiles live at
`users/{uid}` (written with `setDoc(..., { merge: true })`) instead of an
auto-ID document found by querying `email`. Reading and cancelling a
reservation require `resource.data.user_uid == request.auth.uid`.

**Trade-off.** An anonymous uid belongs to one browser profile. It is lost when
the visitor clears site data, and a second device gets a different uid. Today
history and cancellation are keyed by email, so a visitor can see their
bookings from any browser by typing their email. Under this model:

- history and self-service cancellation work only in the browser that booked;
- from another browser, the visitor asks the admin, who can see and cancel
  every reservation, or uses the reference in their confirmation email to
  contact the lab.

**Rejected: let a signed-in visitor read reservations by email.** Any visitor
can type any email address, so a rule like
`resource.data.user_email == <email the client sent>` cannot be enforced, and
`allow read: if isSignedIn()` would expose every visitor's name, email and
group. Anonymous tokens carry no verified email.

**Deferred upgrade path (not part of this decision).** If cross-device history
becomes a requirement, link the anonymous account to an email-link credential
(`linkWithCredential`). The uid is kept and the token gains a verified
`email`, so rules could also allow
`resource.data.user_email == request.auth.token.email &&
request.auth.token.email_verified == true`. That adds a passwordless email
flow and its console configuration, so it stays out of scope until needed.

### One-reservation limit

`getUserReservationCount()` (`src/lib/firebase.js`) counts the visitor's
confirmed future reservations by `user_email`. Under uid-scoped reads the
client can only count reservations owned by its own uid, so a visitor could
book again from a second browser. For #7 and #9 to settle:

1. **Baseline (recommended):** keep the client-side check as UX, but query by
   `user_uid` so the rules can prove the query.
2. **If a per-email limit must be enforced:** in the booking transaction (#9),
   also write a lock document keyed by the normalized email, which non-admin
   clients can never read (rules can still `get()` it). The lock stores the
   `reservation_id` and the slot's `start_time`. The reservation create rule
   requires the lock to be written in the same transaction and to point at
   this reservation (`getAfter(...)`). The lock rule allows the write only
   when no lock exists yet, **or** the existing lock is stale: its
   `start_time < request.time` (the slot has passed), or the reservation it
   names no longer exists or is no longer `confirmed`. So stale locks never
   have to be cleaned up, which matters because there is no backend to expire
   them and a client cannot see them. The lock rule must also bind the lock
   to real data: its `start_time` equals the slot's `start_time` after the
   write (`getAfter(slotPath(slot_id))`, see the conventions under *Coverage
   of every flow*), and its document ID equals the reservation's normalized
   `user_email`. Otherwise a client could backdate its own lock to make it
   stale at once. Visitor cancellation and the admin status-change and
   delete paths should still delete the lock in the same batch. A Firestore
   TTL policy on the lock can tidy old documents, but the rules must not
   depend on it, because TTL deletion is delayed.

Email ownership is not verified in either case, so the limit stops casual
double-booking, not a determined visitor using several addresses.

## Coverage of every flow

The rule shapes below are the target for #7. #7 finalizes the field names and
exact conditions and tests them in the emulator. The code references are the
current functions that perform each flow.

Conventions used in the table:

- `slotPath(id)` stands for `/databases/$(database)/documents/slots/$(id)`
  and `resPath(id)` for `/databases/$(database)/documents/reservations/$(id)`.
  `get`, `getAfter`, `exists` and `existsAfter` need the full path in rules.
- `get()` reads the state before the request. `getAfter()` reads the state the
  whole transaction or batch would leave.
- **Booking and cancellation each bind both documents, in both directions.** A
  reservation cannot be created unless the same write takes its slot. A slot
  cannot be taken unless the same write creates a reservation for it. The same
  holds for cancellation and release. Otherwise reservations can pile up on one
  slot, or a slot can be left taken with no reservation. Both flows must
  therefore run as one transaction or batch (#9). `createReservation` must
  pre-allocate the reservation ID with `doc(collection(db, 'reservations'))`
  instead of `addDoc`, so the slot write can name it.
- #7's criterion "slots can only be created or edited by admins" means
  creating and deleting slots and changing their times or any other field. The
  only non-admin slot write allowed is the bound availability flip below
  (`is_available` and `reservation_id`).

| Flow | Code | Caller identity | Rule shape |
|------|------|-----------------|------------|
| Public slot reads: calendar, live updates, Quick Book, next-slot banner, availability check | `getAvailableSlots`, `subscribeToSlots`, `getClosestAvailableSlot`, `verifySlotAvailability`, and `checkSlotsExist` once #11 restores it | Anyone | `match /slots/{slotId} { allow read: if true; }`. Slot documents hold no personal data. This also drops the `resource.data.is_available == true` read rule, which rejects any query that does not filter on it. |
| Available-slot count on the admin dashboard | `getAvailableSlotsCount` | Admin (rule allows anyone) | Covered by the public slot read rule. |
| Visitor session (the name-and-email "login" page, the booking form, and the `isUserAuthenticated` gates in `App`, `Layout`, `LoginPage` and `UserProfilePage`) | `registerUser`, `isUserAuthenticated`, `getCurrentUser`, `logoutUser` | Visitor (anonymous uid) | The anonymous Firebase Auth session replaces the browser-signed visitor JWT: "signed in" means `auth.currentUser` exists. Entering a name and email only writes profile data; it no longer grants access to history by email. `match /users/{userId} { allow read, create, update: if isSignedIn() && request.auth.uid == userId && <field validation>; }`, plus `isAdmin()` for read. Profiles are written to `users/{uid}`, not found by querying `email`. This also fixes the current rule's `resource.data` check, which blocks first writes. |
| Reservation create | `createReservation` | Visitor (anonymous uid) | `match /reservations/{reservationId}`: `allow create: if isSignedIn() && request.resource.data.user_uid == request.auth.uid && request.resource.data.status == 'confirmed' && <field validation>` **and** the same write takes the slot: `get(slotPath(request.resource.data.slot_id)).data.is_available == true && getAfter(slotPath(request.resource.data.slot_id)).data.is_available == false && getAfter(slotPath(request.resource.data.slot_id)).data.reservation_id == reservationId`. |
| Marking the slot unavailable | `createReservation` (slot update) | Visitor (anonymous uid) | Slot `update` by a non-admin only when `request.resource.data.diff(resource.data).affectedKeys().hasOnly(['is_available', 'reservation_id'])`, `resource.data.is_available == true`, `request.resource.data.is_available == false`, and the reservation it names is created by the same write: `!exists(resPath(request.resource.data.reservation_id))`, and `getAfter(resPath(request.resource.data.reservation_id))` has `slot_id == slotId` and `user_uid == request.auth.uid`. One transaction (#9). |
| Visitor cancellation | `cancelReservation` (deletes the reservation, frees the slot) | Visitor (anonymous uid) | Reservation `allow delete: if isSignedIn() && resource.data.user_uid == request.auth.uid` **and** the same write frees the slot: `get(slotPath(resource.data.slot_id)).data.reservation_id == reservationId && getAfter(slotPath(resource.data.slot_id)).data.is_available == true`. Slot `update` back to available only when the keys are limited as above, `request.resource.data.is_available == true`, the reservation named by `resource.data.reservation_id` belongs to the caller (`get(resPath(resource.data.reservation_id)).data.user_uid == request.auth.uid`) and is gone after the write (`!existsAfter(resPath(resource.data.reservation_id))`). Today `cancelReservation` deletes and then updates in two calls; under these rules the second call would be denied and leave the slot taken, so cancellation must become one batch too. |
| User history | `getUserReservations` | Visitor (anonymous uid) | Reservation `allow read: if isAdmin() \|\| (isSignedIn() && resource.data.user_uid == request.auth.uid)`. The query must filter `where('user_uid', '==', uid)` so the rules can prove every result is the caller's; needs a `user_uid` + `created_at` index (#7). |
| One-reservation limit | `getUserReservationCount` | Visitor (anonymous uid) | Same read rule; query by `user_uid` + `status` (index in #7). Optional email lock: see *One-reservation limit*. |
| Admin setup | none in the app (console) | Firebase console operator | No rule: the console creates the Auth user and the `admins/{uid}` document. `admins` is `allow write: if false` for clients. |
| Admin login and logout | `AdminPage` login form (#6 replaces `loginAdmin` / `logoutAdmin`) | Admin (email/password) | `signInWithEmailAndPassword`; the UI treats the user as admin only if `getDoc(admins/{uid})` exists (allowed by the `admins` read rule). Logout calls `signOut()`; visitor pages then sign in anonymously again. The real enforcement is `isAdmin()` in every admin rule, not the UI check. |
| Admin slot CRUD | `createSlot`, `updateSlot`, `deleteSlot` (`AdminSlotPage`), plus `resetSlotAvailability`, an internal helper of `deleteReservation` (which has no UI caller today) | Admin | Slots `allow create, update, delete: if isAdmin()`, alongside the narrow visitor update above. |
| Admin reservation list, status changes, deletion | `getReservations`, `updateReservationStatus`, `deleteReservation`, the reservation query in `deleteSlot` | Admin | Reservations `allow read, update, delete: if isAdmin()`. |
| Settings | `settings/*` (today only `admin_password_hash`, removed by #6) | Admin | `match /settings/{settingId} { allow read, write: if isAdmin(); }`. Nothing public reads settings. |
| Anything else | | | No catch-all `match /{document=**}` rule; unmatched paths are denied by default. |

Emails (EmailJS) are sent from the browser and do not touch Firestore rules.

## Follow-up work and owners

None of #6, #7 and #9 owns all of the visitor-side client work this decision
needs, so each piece is assigned here:

- **#6 (admin sign-in)**: Firebase Auth email/password sign-in, plus the
  `admins/{uid}` check in the UI. Remove the in-app password setup, the 32-bit
  hash and `settings/admin_password_hash`. #6's criterion "no signing secret is
  present in the client bundle" also covers `src/lib/userService.js`, which
  signs visitor JWTs with the same secret and a hard-coded fallback. So #6
  must also **remove the visitor JWT** and replace it with the **anonymous
  sign-in bootstrap**: call `signInAnonymously()` when there is no current
  user, and switch the `isUserAuthenticated` gates to `auth.currentUser`. If
  #6 is kept admin-only, file a new issue for this before #7 lands.
- **#7 (rules rewrite)**: rewrite `firestore.rules` and
  `firestore.indexes.json` to the shapes above. It also makes the data changes
  the rules depend on: the `user_uid` field on reservations, profiles at
  `users/{uid}`, history and count queries filtered by `user_uid` (with their
  indexes), and the choice of one-reservation-limit option. It tests every app
  query in the Firestore emulator.
- **#9 (atomic booking)**: run booking as one transaction with a pre-allocated
  reservation ID: availability check, reservation create, slot flip with
  `reservation_id`. Extend #9's scope, or file a follow-up issue, to batch
  **cancellation** the same way (reservation delete plus slot release). #9's
  criteria cover booking only, and the rules above deny today's two-call
  cancellation.

Admin cancellation through `updateReservationStatus` keeps today's behavior:
the status changes and the slot stays taken. Admin rules allow any write, so
this needs no special rule. If the email lock is adopted, the admin paths
should also delete the lock (see *One-reservation limit*).
