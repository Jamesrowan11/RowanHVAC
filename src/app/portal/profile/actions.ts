"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";

export type ProfileState = { ok: boolean; error?: string; message?: string };

const profileSchema = z.object({
  name: z.string().min(2).max(160),
  email: z.string().email().max(160),
  phone: z.string().max(40).optional(),
});

export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authorized." };

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Please check your details." };

  const email = parsed.data.email.toLowerCase().trim();
  const clash = await prisma.user.findFirst({
    where: { email, NOT: { id: user.id } },
    select: { id: true },
  });
  if (clash) return { ok: false, error: "That email is already in use." };

  // Scoped strictly to the session user's own id.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: parsed.data.name.trim(),
      email,
      phone: parsed.data.phone?.trim() || null,
    },
  });

  revalidatePath("/portal/profile");
  return { ok: true, message: "Your profile has been updated." };
}

export async function changePassword(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authorized." };

  const current = String(formData.get("currentPassword") || "");
  const next = String(formData.get("newPassword") || "");
  const confirm = String(formData.get("confirmPassword") || "");

  if (next.length < 8) {
    return { ok: false, error: "New password must be at least 8 characters." };
  }
  if (next !== confirm) {
    return { ok: false, error: "New passwords do not match." };
  }

  const full = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!full) return { ok: false, error: "Not authorized." };

  const ok = await verifyPassword(current, full.passwordHash);
  if (!ok) return { ok: false, error: "Your current password is incorrect." };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next) },
  });

  return { ok: true, message: "Your password has been changed." };
}
