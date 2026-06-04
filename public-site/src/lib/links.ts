// URL of the portal (the Node.js app on the other subdomain). Inlined at build
// time. Override with NEXT_PUBLIC_PORTAL_URL when building for a different host.
export const PORTAL_URL =
  process.env.NEXT_PUBLIC_PORTAL_URL || "https://rowanhvacportal.rowancopy.com";

export const LOGIN_URL = `${PORTAL_URL}/login`;
export const QUOTE_API_URL = `${PORTAL_URL}/api/public/quote`;
