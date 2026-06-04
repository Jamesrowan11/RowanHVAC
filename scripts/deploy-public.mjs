// Build the public marketing site and copy it into the subdomain document root —
// without needing a terminal. Run it from cPanel's "Setup Node.js App" screen via
// the "Run JS script" dropdown:  deploy:public
//
// Reads these environment variables (set them on the Node.js App page under
// "Environment variables", or rely on the defaults):
//   PUBLIC_DEPLOY_PATH   (required) document root of rowanhvac.rowancopy.com
//   NEXT_PUBLIC_PORTAL_URL  (default https://rowanhvacportal.rowancopy.com)
//   NEXT_PUBLIC_SITE_URL    (default https://rowanhvac.rowancopy.com)

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public-site");

const portalUrl =
  process.env.NEXT_PUBLIC_PORTAL_URL || "https://rowanhvacportal.rowancopy.com";
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "https://rowanhvac.rowancopy.com";
const deployPath = process.env.PUBLIC_DEPLOY_PATH;

if (!deployPath) {
  console.error(
    "\nERROR: PUBLIC_DEPLOY_PATH is not set.\n" +
      "Set it to the document root of rowanhvac.rowancopy.com (e.g.\n" +
      "/home/youruser/rowanhvac.rowancopy.com) on the Node.js App page under\n" +
      "Environment variables, then run deploy:public again.\n",
  );
  process.exit(1);
}

const env = {
  ...process.env,
  NEXT_PUBLIC_PORTAL_URL: portalUrl,
  NEXT_PUBLIC_SITE_URL: siteUrl,
};

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd: publicDir, env, stdio: "inherit" });
}

console.log(`==> Building public site (portal: ${portalUrl})`);
run("npm install --no-audit --no-fund");
run("npm run build");

const out = join(publicDir, "out");
if (!existsSync(out)) {
  console.error(`ERROR: expected build output at ${out} but it is missing.`);
  process.exit(1);
}

console.log(`==> Copying ${out} -> ${deployPath}`);
mkdirSync(deployPath, { recursive: true });
cpSync(out, deployPath, { recursive: true, force: true });

console.log(`\n✅ Public site published to ${deployPath}`);
console.log(`   Visit ${siteUrl} to verify.`);
