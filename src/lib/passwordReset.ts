import crypto from "crypto";
import type { Role } from "@prisma/client";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export function generateResetToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = hashResetToken(raw);
  return { raw, hash };
}

export function hashResetToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Where a password-reset email should be delivered.
 * EMPLOYEE/ADMIN → their personal email if set (so it reaches a private inbox),
 * otherwise their login email. CLIENT → always the email on file.
 */
export function resetEmailRecipient(user: {
  role: Role;
  email: string;
  personalEmail: string | null;
}): string {
  if (user.role !== "CLIENT" && user.personalEmail && user.personalEmail.trim()) {
    return user.personalEmail.trim();
  }
  return user.email;
}

/** Absolute base URL for building reset links (works behind a proxy/subdomain). */
export function appBaseUrl(): string {
  return (
    process.env.AUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}
