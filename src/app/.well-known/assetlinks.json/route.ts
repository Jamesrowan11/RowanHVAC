import { NextResponse } from "next/server";

/**
 * Digital Asset Links — proves this website and the Google Play (TWA) app
 * belong together, so the installed app opens full-screen without a browser
 * address bar. Set ANDROID_PACKAGE_NAME and ANDROID_CERT_FINGERPRINT.
 *
 * ANDROID_CERT_FINGERPRINT may list MULTIPLE SHA-256 fingerprints separated by
 * commas — include both your local upload key (for sideloaded APKs) and the
 * Google Play app-signing key (Play Console → Setup → App integrity), since
 * Play re-signs the app with its own key. Until set, returns an empty list.
 */
export function GET() {
  const pkg = process.env.ANDROID_PACKAGE_NAME;
  const fingerprints = (process.env.ANDROID_CERT_FINGERPRINT || "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  const body =
    pkg && fingerprints.length > 0
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: pkg,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ]
      : [];

  return NextResponse.json(body, {
    headers: { "Content-Type": "application/json" },
  });
}
