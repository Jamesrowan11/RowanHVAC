"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { hashResetToken } from "@/lib/passwordReset";

export type ResetState = { ok: boolean; message?: string; error?: string };

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirm: z.string(),
});

export async function resetPasswordWithToken(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check your entries.",
    };
  }
  if (parsed.data.password !== parsed.data.confirm) {
    return { ok: false, error: "Passwords do not match." };
  }

  const tokenHash = hashResetToken(parsed.data.token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (
    !record ||
    record.usedAt ||
    record.expiresAt < new Date() ||
    !record.user.active
  ) {
    return {
      ok: false,
      error:
        "This reset link is invalid or has expired. Please request a new one.",
    };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(parsed.data.password) },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    // Invalidate any other outstanding tokens for this user.
    prisma.passwordResetToken.deleteMany({
      where: { userId: record.userId, usedAt: null, NOT: { id: record.id } },
    }),
  ]);

  return {
    ok: true,
    message: "Your password has been reset. You can now sign in.",
  };
}
