"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { rateLimit, clientIpFromHeaders } from "@/lib/rateLimit";
import {
  generateResetToken,
  resetEmailRecipient,
  appBaseUrl,
  RESET_TOKEN_TTL_MS,
} from "@/lib/passwordReset";

export type ForgotState = { ok: boolean; message?: string; error?: string };

const schema = z.object({ email: z.string().email() });

export async function requestPasswordReset(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  // Throttle: 5 requests / 15 min per IP.
  const ip = clientIpFromHeaders(await headers());
  if (!rateLimit(`forgot:${ip}`, 5, 15 * 60 * 1000).ok) {
    return {
      ok: false,
      error: "Too many requests. Please wait a few minutes and try again.",
    };
  }

  const parsed = schema.safeParse({ email: formData.get("email") });
  // Always return the same generic success so we never reveal which emails exist.
  const generic: ForgotState = {
    ok: true,
    message:
      "If an account exists for that email, we've sent password reset instructions. Please check your inbox.",
  };
  if (!parsed.success) return generic;

  const email = parsed.data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return generic;

  // Invalidate any previous outstanding tokens for this user.
  await prisma.passwordResetToken.deleteMany({
    where: { userId: user.id, usedAt: null },
  });

  const { raw, hash } = generateResetToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  const link = `${appBaseUrl()}/reset-password?token=${raw}`;
  const to = resetEmailRecipient(user);

  await sendEmail({
    to: [to],
    subject: "Reset your Rowan portal password",
    body: `Hello ${user.name},\n\nWe received a request to reset the password for your Rowan portal account (${user.email}).\n\nClick the link below to choose a new password. This link expires in 1 hour and can be used once:\n\n${link}\n\nIf you didn't request this, you can safely ignore this email — your password won't change.`,
    senderUserId: null,
  });

  return generic;
}
