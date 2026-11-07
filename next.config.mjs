/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
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
