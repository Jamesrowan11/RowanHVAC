# Rowan HVAC — Android App (Google Play)

This is the **Android app** for Rowan Heating & Air Conditioning. It is a
**Trusted Web Activity (TWA)** — a thin native wrapper around the live website
and portal (`rowanhvac.com`). Because it loads the same site, the app and the
website are one system: the **same login, the same data, the same features**.
Anything you change on the website instantly shows up in the app — no app
update needed.

`twa-manifest.json` in this folder is the single source of truth for the app
(package name, colors, icon, start page, shortcuts). The full Android/Gradle
project is *generated* from it by Bubblewrap — that generated output is
gitignored, so this folder stays small and the manifest is what you edit and
commit.

## How the app and website work together

- The app opens `https://rowanhvac.com/portal` full-screen (no browser bar).
- Sign-in, jobs, calendar, messages, photos, payments — all served by the
  website, so the app always matches the site.
- The site's `/.well-known/assetlinks.json` endpoint (already built into the
  website) proves the app and domain belong together. You paste the app's
  signing fingerprint into the website's environment and it verifies
  automatically (see step 5).

## Prerequisites

- Node.js 18+ and a JDK 17 (Bubblewrap installs the Android SDK for you).
- A **Google Play Developer account** ($25 one-time) to publish.
- The website live on its production domain (`rowanhvac.com`). If you want to
  build against the preview first, change `"host"` and the URLs in
  `twa-manifest.json` to `rowanhvac.rowancopy.com`.

## Build the app

```bash
# 1. Install Bubblewrap (Google's official TWA tool)
npm install -g @bubblewrap/cli

# 2. From this folder, generate the Android project from the manifest
cd android
bubblewrap init --manifest ./twa-manifest.json

# 3. Build the release app bundle (creates/uses a signing key — KEEP IT SAFE)
bubblewrap build
#   → produces app-release-bundle.aab  (upload this to Google Play)
#   → and a signing keystore (android.keystore). Back this up; you need the
#     same key for every future update.

# 4. Print the signing fingerprint you'll need for verification
keytool -list -v -keystore android.keystore -alias android | grep SHA256
```

## Connect the app to the website (Digital Asset Links)

5. Put the package name and SHA-256 fingerprint into the **website's** `.env`
   (on the Plesk server), then restart the web app:
   ```ini
   ANDROID_PACKAGE_NAME="com.rowanhvac.app"
   ANDROID_CERT_FINGERPRINT="AB:CD:...:EF"   # the SHA-256 from step 4
   ```
   Verify it's live: open `https://rowanhvac.com/.well-known/assetlinks.json`
   — it should list the package + fingerprint. This is what removes the
   browser address bar in the installed app.

   > When you enable **Play App Signing** (recommended), Google re-signs the
   > app and shows a *second* SHA-256 under Play Console → Setup → App
   > integrity. Add **both** fingerprints — see "Multiple fingerprints" below.

## Publish

6. In the **Google Play Console**: Create app → upload the `.aab` → fill in the
   listing (name "Rowan Heating & Air", description, screenshots), content
   rating, privacy policy, and data-safety form.
7. Roll out to **Internal testing** first to confirm it opens clean, then
   promote to **Production** (first review takes a few days).

## Using Android Studio + GitHub (optional)

After `bubblewrap init`, this folder is a normal Android project you can open
in **Android Studio** (`Get from VCS` to clone, or `Git → GitHub → Share
Project`). You only need this if you want to customize the native wrapper
(splash, push notifications, deep links). For a straight Play Store listing,
the Bubblewrap CLI above is enough.

## Multiple signing fingerprints

If you use Play App Signing, the website should trust both your upload key and
Google's app-signing key. The website's assetlinks endpoint can be extended to
return several fingerprints — ask and it'll be wired to accept a
comma-separated `ANDROID_CERT_FINGERPRINT`.

## Updating the app later

The app is just a shell — **website changes need no app update.** Rebuild and
re-upload the `.aab` only when you change something in `twa-manifest.json`
(app name, icon, colors, shortcuts). Bump `appVersionCode` (and
`appVersionName`) before `bubblewrap build`, then upload the new bundle.
