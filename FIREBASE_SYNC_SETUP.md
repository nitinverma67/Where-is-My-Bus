# Where Is My Bus — Firebase sync setup

This version adds a Firebase Realtime Database sync bridge for these shared keys:

- `wimb_management_data_v1` → `shared/managementData`
- `wimb_demo_notices_v2` → `shared/notices`
- `wimb_demo_pickups_v2` → `shared/pickups`

The management page seeds the shared management data only if that database path is empty. Shared updates are applied to local storage and the page reloads to refresh existing in-memory app data. Login/session keys remain local to each browser.

## Important security requirement

The portal's existing `admin/admin123`, `student/student123`, and `driver/driver123` credentials are demo-only client-side logins; they do not authenticate users with Firebase. Keep Realtime Database in locked mode until Firebase Authentication and role-based database rules are configured. Do **not** use public read/write rules such as `.read: true` or `.write: true`.

With the database locked, the browser can initialize Firebase but cloud reads/writes will show `PERMISSION_DENIED`; this is expected until secure authentication and rules are added.

## Verify the sync bridge

1. Open the project using VS Code Live Server (not by double-clicking HTML files).
2. Open DevTools → Console.
3. Confirm `Firebase initialized: [DEFAULT]` and `[WIMB sync] Realtime sync bridge loaded.`
4. If you see `PERMISSION_DENIED`, leave rules locked and configure Firebase Authentication and role-specific rules before testing cross-device writes.

## Files changed

- `firebase.js`: exposes the initialized database as `window.database`.
- `cloud-sync.js`: shared-data synchronization bridge.
- `management.html`, `student.html`, `driver.html`: load the bridge after Firebase.
- `management.js`: seeds default management data if the shared database is empty.


## Portal announcements update
- Student and driver dashboards now include a separate Management announcements panel.
- Management announcements are filtered by audience and route.
- Firebase value changes notify the open portal without forcing a full page reload.
- Driver-created route alerts remain in the Driver notices / Sent notices areas and are intended for students on that route.
