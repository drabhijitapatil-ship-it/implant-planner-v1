# EAS Build Guide — Implanr Apps

Android APK builds for client sharing and production releases.

---

## Prerequisites (One-Time Setup)

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Login — use the Expo account that owns the project
eas login
```

> Owner account: `abhijitapatil` (set in both `app.json` files)

---

## Update App Version Before Building

Always bump the version before creating a new build for the client.

### College App

**File:** `phase1/implanr-college/app.json`

```json
{
  "expo": {
    "version": "1.0.1",
    "android": {
      "versionCode": 2
    }
  }
}
```

### Clinic App

**File:** `phase1/implanr-clinic/app.json`

```json
{
  "expo": {
    "version": "1.0.1",
    "android": {
      "versionCode": 2
    }
  }
}
```

### Version Rules

| Field | What it is | When to change |
|-------|-----------|---------------|
| `version` | Display version (e.g. `1.0.1`) | Every release shared with client |
| `versionCode` | Integer, must increment each build | Every new APK build (Android requires this to be higher than the previous build) |

**Example progression:**

| Release | `version` | `versionCode` |
|---------|-----------|--------------|
| First build | `1.0.0` | `1` |
| Bug fix | `1.0.1` | `2` |
| New feature | `1.1.0` | `3` |
| Major update | `2.0.0` | `4` |

---

## Build APK — College App

```bash
cd /path/to/phase1/implanr-college

eas build --platform android --profile preview --non-interactive
```

- Output: `.apk` file (directly installable)
- API URL: `https://api.implanr.com` (set automatically by `eas.json`)
- Build time: ~10–15 minutes on Expo cloud servers
- No local Android SDK required

---

## Build APK — Clinic App

```bash
cd /path/to/phase1/implanr-clinic

eas build --platform android --profile preview --non-interactive
```

Same as college — separate APK, separate package (`com.implanr.clinic`).

---

## Build Both Apps

Run these sequentially (or open two terminal tabs):

```bash
# Terminal 1 — College
cd /path/to/phase1/implanr-college
eas build --platform android --profile preview --non-interactive

# Terminal 2 — Clinic
cd /path/to/phase1/implanr-clinic
eas build --platform android --profile preview --non-interactive
```

---

## After Build Completes

EAS prints a download URL:

```
✅ Build finished
https://expo.dev/artifacts/eas/xxxxxxxxxxxxxxxx.apk
```

**Share with client:**
- Send the `.apk` download URL directly, OR
- Download and share the file via WhatsApp / email / Drive
- Client opens it on Android → allows "Install from unknown sources" → installs

**View all builds:**
```bash
eas build:list
```

Or visit: https://expo.dev/accounts/abhijitapatil/projects

---

## Build Profiles

| Profile | Output | API URL | Use for |
|---------|--------|---------|---------|
| `preview` | `.apk` | `https://api.implanr.com` | Client sharing / testing |
| `development` | `.apk` | `https://api.implanr.com` | Internal dev with dev client |
| `production` | `.aab` | `https://api.implanr.com` | Google Play Store submission |

---

## iOS Build (If Needed)

```bash
eas build --platform ios --profile preview --non-interactive
```

> Requires Apple Developer account + provisioning profiles configured in EAS.
> Android APK is recommended for quick client sharing — no Apple account needed.

---

## Local vs Production API

| Environment | Backend URL |
|-------------|------------|
| `npx expo start` (local dev) | `http://localhost:8001` (from `.env.local`) |
| EAS build (any profile) | `https://api.implanr.com` (from `eas.json` env) |

`.env.local` is never included in EAS builds — production URL is always used for any APK/AAB built via EAS.

---

## Quick Checklist Before Each Build

- [ ] Bump `version` in `app.json`
- [ ] Increment `versionCode` in `app.json` (must be higher than last build)
- [ ] Backend is live at `https://api.implanr.com`
- [ ] `eas login` done with `abhijitapatil` account
- [ ] Run build command from the correct app directory
