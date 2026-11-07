/**
 * Create (or reset) an office admin account on a live site, without demo data.
 *
 *   npm run create-admin -- --email you@rowanheatingandair.com --name "Your Name"
 *
 * Prints a one-time temporary password; sign in with it and change it under
 * My Profile. Running it again for the same email resets that password and
 * makes sure the account is an active admin.
 */
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  try {
    process.loadEnvFile?.(".env");
  } catch {
    // no .env file: rely on the environment
  }
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage: npm run create-admin -- --email you@rowanheatingandair.com --name "Your Name"');
  }

  // Readable temporary password: 4 groups of 4 (no look-alike characters).
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(16);
  const temp = Array.from(bytes, (b) => chars[b % chars.length])
    .join("")
    .replace(/(.{4})(?!$)/g, "$1-");

  const prisma = new PrismaClient();
  try {
    const passwordHash = await hashPassword(temp);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.user.update({
        where: { email },
        data: { role: "ADMIN", active: true, passwordHash, ...(name ? { name } : {}) },
      });
      console.log(`Updated ${email}: active admin, password reset.`);
    } else {
      await prisma.user.create({
        data: { email, name: name || email.split("@")[0], role: "ADMIN", active: true, passwordHash },
      });
      console.log(`Created admin ${email}.`);
    }
    console.log(`\n  Temporary password:  ${temp}\n`);
    console.log("Sign in at /login, then change it under My Profile.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
