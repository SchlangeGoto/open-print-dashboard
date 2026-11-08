# Open Print Dashboard — mobile

Native Expo client for Open Print Dashboard. It talks to the same FastAPI
backend as the web app and shares its barcode catalog, spool inventory, and
refresh-token auth.

## Features

- Configurable server URL with a live connection test
- Email/password login with rotating refresh tokens stored in secure device
  storage (Keychain on iOS, Keystore on Android)
- Filament inventory with search, remaining weight, and loaded-printer state
- Spool details and one-tap loading into a printer
- Native barcode scanning with `expo-camera`
  - Known Bambu barcode → creates a filament/spool automatically
  - Unknown barcode → one-time filament form, then remembered
- Printer overview with online state and loaded spool
- Automatic access-token refresh, including offline-friendly session handling
- Light and dark themes

## Requirements

- Node.js 20+
- The backend reachable from the phone
- Expo Go for quick development, or a development build for camera behavior
  closest to production

## Run

```bash
cd mobile
npm install
npm start
```

Then scan the QR code with Expo Go, or press `a` for an Android emulator / `i`
for the iOS simulator.

If the QR code points at a VPN address instead of your Wi-Fi address, use:

```bash
npm run start:lan
```

### Phone can't open the Expo QR code

“Something went wrong” in Expo Go before the app loads usually means the phone
cannot reach Metro. Stop the old Expo server, then start with the LAN address
forced:

```bash
npm run start:lan
```

or, with a known address:

```bash
REACT_NATIVE_PACKAGER_HOSTNAME=192.168.0.10 npx expo start -c
```

Then check:

- the phone and computer are on the same Wi-Fi, with no VPN blocking LAN traffic
- the phone browser can open `http://<lan-ip>:8081`
- the computer firewall allows TCP `8081` (Metro) and `8000` (backend)
- as a last resort, `npx expo start -c --tunnel`

Settings → App & build shows the loaded build tag (`in-app-scanner-fix`), so a
stale bundle is visible.

```bash
npm run typecheck
npm run lint
```

## Server URL

On first launch the app asks for the backend URL:

| Setup | Example |
| --- | --- |
| Same Wi-Fi / LAN | `http://192.168.1.50:8000` |
| Public reverse proxy | `https://print.example.com` |

The app appends `/api/v1` itself; you can paste either the root URL or one that
already includes `/api/v1`.

For access outside your LAN, expose the backend over HTTPS (reverse proxy,
Tailscale Funnel, Cloudflare Tunnel, etc.) and enter that URL. Plain HTTP is
only accepted for local/private addresses; a public host must use HTTPS. Do
**not** expose the backend over plain HTTP to the public internet — the login
protects the API, but the credentials and tokens would travel unencrypted.

### Local HTTP notes

- Android development builds allow cleartext HTTP through
  `expo-build-properties` in `app.json`.
- iOS allows local networking through `NSAllowsLocalNetworking`; for a remote
  server use HTTPS.
- Expo Go may apply its own network policy. If a LAN URL is blocked, use HTTPS
  or a development build.

## Auth

- Access tokens expire after 1 hour.
- Refresh tokens expire 90 days after issuance and rotate on every use.
- Both are stored with `expo-secure-store` on iOS/Android; the app never stores
  the password.
- On a `401`, the client refreshes once and retries the request. If the refresh
  token is revoked, the app returns to the login screen.
- A temporary network failure keeps the session instead of signing the user out.

## Project structure

```text
src/
  app/                 Expo Router routes
    (auth)/            server setup + login
    (app)/(tabs)/      spools, scan, printers, settings
    (app)/spool/       spool detail
    (app)/scan-confirm unknown-barcode form
  components/          shared UI and cards
  hooks/               focus-aware async data loading
  lib/                 API client, auth provider, storage, theme
```

## Build

Install EAS CLI and configure a project:

```bash
npm install -g eas-cli
eas build:configure
eas build --platform android
eas build --platform ios
```

Set `EXPO_PUBLIC_*` values only for non-secret configuration. The server URL is
configured per device in the app, not baked into the build.
