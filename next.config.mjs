import { execSync } from "child_process";

function gitCommit() {
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null; // not a git checkout: Next.js picks a random build id
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Behind a load balancer every server builds the same commit itself. Using
  // the commit as the build id (plus the same NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
  // in every server's .env) makes all servers' builds interchangeable, so a
  // page served by one server can submit its forms to another.
  generateBuildId: async () => process.env.BUILD_ID || gitCommit(),
  // The website, customer portal, staff portal and van API are one app on one
  // domain (rowanheatingandair.com): "/" is the public home page, "/login" and
  // "/portal" the portal. PORTAL_ONLY=1 (in .env, then rebuild) is only for a
  // portal-only install: "/" then goes straight to the portal login.
  async redirects() {
    return process.env.PORTAL_ONLY === "1"
      ? [{ source: "/", destination: "/portal", permanent: false }]
      : [];
  },
};

export default nextConfig;
