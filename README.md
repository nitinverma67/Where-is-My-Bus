# Where Is My Bus — Phase 2: Firebase live GPS

React + TypeScript + Vite + Google Maps + Firebase Realtime Database.

## What Phase 2 adds

- Driver enters a bus ID and starts GPS sharing from a phone/browser.
- Device Geolocation API watches the actual device position.
- Each position is published to `liveLocations/{BUS-ID}` in Firebase Realtime Database.
- Student portal subscribes to the selected bus ID and receives location updates without refreshing.
- Management portal subscribes to all bus locations and shows a live/offline fleet list.
- The driver is marked offline when tracking is stopped; Firebase `onDisconnect` also marks it offline if the connection drops.
- Anonymous Firebase Authentication is used silently for this development phase; no login screen is shown.

## 1. Requirements and local setup

Use Node.js 22+.

```bash
npm install
```

Copy `.env.example` to `.env` on Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Add your NEW restricted Google Maps key to `VITE_GOOGLE_MAPS_API_KEY`. Keep `.env` out of Git; it is already ignored.

Start the app:

```bash
npm run dev
```

## 2. Enable anonymous authentication

In Firebase Console → Authentication → Sign-in method → enable **Anonymous**.

This creates a temporary Firebase identity for each browser/device without showing a login form. The portal role selector is only a development convenience; it is not real access control.

## 3. Apply Realtime Database rules

Open Firebase Console → Realtime Database → Rules. Replace the rules with the contents of `database.rules.json`, then Publish.

These rules require a signed-in Firebase session and validate coordinates. They are a development baseline only: any anonymous authenticated client can still read/write any bus ID. Before real deployment, Phase 3 must add proper accounts and enforce that each driver can write only their assigned bus, students can read only permitted routes, and management has authorized fleet access.

Do not use unrestricted public `.read: true` / `.write: true` rules.

## 4. Test two devices

1. Start the app on a phone or laptop that can provide location. Select **Driver portal**.
2. Enter a shared bus ID such as `BUS-01` and click **Start live tracking**. Allow location permission. Keep the page open.
3. Open the same deployed app or local app on another device/browser. Select **Student portal** and enter exactly `BUS-01`.
4. The student map should move as Firebase receives driver GPS updates. No page refresh is required.
5. Select **Management portal** to see all bus IDs that have reported GPS.
6. Stop tracking on the driver device. The bus should show Offline.

For a local app opened on two devices on the same Wi-Fi, use the computer's LAN IP and Vite host mode (`npm run dev -- --host 0.0.0.0`). Browser geolocation requires a secure context: localhost is allowed, but a phone accessing an `http://192.168...` address may block GPS. Use HTTPS hosting or a secure tunnel for cross-device GPS tests.

## 5. Build and deploy

```bash
npm run typecheck
npm run build
```

For GitHub Actions, add the Google Maps key as a repository secret and the Firebase `VITE_FIREBASE_*` values as Actions variables as described in the existing deployment workflow. GitHub Pages is static hosting; Firebase provides the real-time backend.

## 6. Known limits before production

- No full account/login system yet; role switching is not secure.
- Anonymous auth is only a bridge for development. Anyone can create an anonymous session.
- Bus IDs are manually entered in this phase; Phase 3 will load assigned buses/routes from Firestore.
- Browser GPS is reliable only while the page is active and permission is granted. Mobile OS/browser background limits may pause updates.
- Firestore records, notices, pickup requests, route matching, push notifications and management CRUD are subsequent migration phases.
