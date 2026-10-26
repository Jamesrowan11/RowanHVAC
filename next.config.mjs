/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // PORTAL_ONLY=1 (in .env, then rebuild): visiting the bare address goes
  // straight to the portal (login page, or your dashboard if signed in)
  // instead of the marketing home page. Use it when the marketing site lives
  // elsewhere, e.g. the portal on portal.rowanheatingandair.com.
  async redirects() {
    return process.env.PORTAL_ONLY === "1"
      ? [{ source: "/", destination: "/portal", permanent: false }]
      : [];
  },
};

export default nextConfig;
