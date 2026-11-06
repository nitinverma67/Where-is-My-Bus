# Where Is My Bus — React + TypeScript starter

This is the first migration foundation for the existing Where Is My Bus project. It includes Vite, React, TypeScript, Tailwind CSS v4, Google Maps, Firebase initialization, a device GPS watcher, and a GitHub Pages workflow.

## 1. Requirements

- Node.js 22 or newer
- npm
- A newly created, HTTP-referrer-restricted Google Maps browser key
- The existing Firebase project configuration (already represented in `.env.example`)

## 2. Run locally

```bash
npm install
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Open `.env`, paste the NEW Google Maps browser key into `VITE_GOOGLE_MAPS_API_KEY`, then run:

```bash
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

## 3. GitHub Pages

Repository: `https://github.com/nitinverma67/Where-Is-My-Bus`

1. Push this project to the repository's `main` branch.
2. In GitHub, open Settings → Pages.
3. Set Build and deployment source to **GitHub Actions**.
4. In Settings → Secrets and variables → Actions, add repository secret `VITE_GOOGLE_MAPS_API_KEY` with the new restricted browser key.
5. Add the Firebase values from `.env` as repository Actions variables with the same names (omit the `VITE_` prefix only if you also change the workflow; currently use the exact names shown in the workflow).
6. Push to `main` or run the workflow manually.

The initial GitHub Pages URL will be `https://nitinverma67.github.io/Where-Is-My-Bus/`.

## 4. Custom domain later

When the domain is known and connected in GitHub Pages, change the workflow's `VITE_BASE_PATH` from `/Where-Is-My-Bus/` to `/`. Add the actual domain to the Google Maps website restrictions. Configure the domain in repository Settings → Pages before changing DNS. Follow GitHub's current DNS instructions for the domain registrar.

## 5. Current starter limitations

- The map is a real Google Map once a valid key and billing-enabled Maps JavaScript API project are configured.
- **Start device GPS** reads this browser/device's real geolocation and moves the map marker.
- This initial starter does not yet broadcast GPS to other devices. The next implementation step is authenticated publishing/subscription through Firebase Realtime Database and matching database security rules.
- The old portal's data and workflows are not yet migrated. Keep the old project unchanged until each feature is migrated and verified.

## 6. Build check

```bash
npm run typecheck
npm run build
```
