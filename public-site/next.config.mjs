/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static export — the `out/` directory drops straight into the
  // rowanhvac.rowancopy.com subdomain document root on GoDaddy. No server needed.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
};

export default nextConfig;
