import { NextResponse } from "next/server";

/**
 * Digital Asset Links — proves this website and the Google Play (TWA) app
 * belong together, so the installed app opens full-screen without a browser
 * address bar. Fill ANDROID_PACKAGE_NAME and ANDROID_CERT_FINGERPRINT (the
 * SHA-256 signing-cert fingerprint from Play Console / PWABuilder). Until then
 * this returns an empty list, which is harmless.
 */
export function GET() {
  const pkg = process.env.ANDROID_PACKAGE_NAME;
  const fingerprint = process.env.ANDROID_CERT_FINGERPRINT;

  const body =
    pkg && fingerprint
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: pkg,
              sha256_cert_fingerprints: [fingerprint],
            },
          },
        ]
      : [];

  return NextResponse.json(body, {
    headers: { "Content-Type": "application/json" },
  });
}
