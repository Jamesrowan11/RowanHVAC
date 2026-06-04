import { redirect } from "next/navigation";

/**
 * The portal app is deployed on its own subdomain (rowanhvacportal.rowancopy.com)
 * and is the private, login-gated half of the project. The public marketing site
 * lives separately as a static export on rowanhvac.rowancopy.com. Visiting the
 * portal root simply sends people to sign in.
 */
export default function PortalRoot() {
  redirect("/login");
}
