"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { compare, hash } from "bcryptjs";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/guards";
import type { ActionState } from "@/lib/actions/jobs";

/**
 * Self-service profile actions. These are ALWAYS scoped to the session
 * user's id — there is no way to pass a target id, so they can never touch
 * another account.
 */

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Valid email is required").max(200),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
});

export async function updateOwnProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser();

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    address: formData.get("address") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };

  // Optional invoice/billing email (clients) — blank clears it.
  let billingEmail: string | null | undefined = undefined;
  if (formData.has("billingEmail")) {
    const raw = String(formData.get("billingEmail") ?? "").trim().toLowerCase();
    if (raw === "") billingEmail = null;
    else {
      const check = z.string().email().max(200).safeParse(raw);
      if (!check.success) return { ok: false, error: "Enter a valid billing email address" };
      billingEmail = check.data;
    }
  }

  const taken = await db.user.findFirst({
    where: { email: parsed.data.email, NOT: { id: user.id } },
  });
  if (taken) return { ok: false, error: "That email is already in use" };

  await db.user.update({
    where: { id: user.id },
    data: { ...parsed.data, ...(billingEmail !== undefined ? { billingEmail } : {}) },
  });
  revalidatePath("/portal", "layout");
  return { ok: true };
}

export async function changeOwnPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser();

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (next.length < 8) return { ok: false, error: "New password must be at least 8 characters" };
  if (next !== confirm) return { ok: false, error: "New passwords don't match" };

  const valid = await compare(current, user.passwordHash);
  if (!valid) return { ok: false, error: "Current password is incorrect" };

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hash(next, 12) },
  });
  return { ok: true };
}
