/**
 * Production-safe first admin. Unlike prisma/seed.ts (a DEMO seed that deletes
 * every record and creates "Password123!" logins), this never deletes anything:
 * it creates one ADMIN with a random password only when no admin exists yet.
 * The admin signs in by using "Forgot password" once email works.
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_NAME="Teresa Rowan" npx tsx prisma/create-admin.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.log("ADMIN_EMAIL not set; skipping first-admin creation.");
    return;
  }
  const existing = await prisma.user.count({ where: { role: "ADMIN" } });
  if (existing > 0) {
    console.log(`An admin already exists (${existing}); nothing to do.`);
    return;
  }
  const passwordHash = await bcrypt.hash(randomBytes(24).toString("base64url"), 10);
  await prisma.user.create({
    data: { name: process.env.ADMIN_NAME || "Administrator", email, role: "ADMIN", passwordHash },
  });
  console.log(`Created admin ${email}. Use "Forgot password" on the login page to set a password.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
