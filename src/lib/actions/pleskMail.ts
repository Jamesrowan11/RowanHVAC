"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { actionRole } from "@/lib/guards";
import {
  createMailbox, deleteMailbox, resetMailboxPassword, setMailboxForwarding, mailDomain,
} from "@/lib/plesk";
import type { ActionState } from "@/lib/actions/jobs";

const nameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Mailbox name is required")
  .max(64)
  .regex(/^[a-z0-9._-]+$/, "Use only letters, numbers, dots, dashes, and underscores");

const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(100);

export async function createMailboxAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");

  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) return { ok: false, error: name.error.errors[0]?.message };
  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) return { ok: false, error: password.error.errors[0]?.message };

  try {
    await createMailbox(name.data, password.data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create mailbox" };
  }

  revalidatePath("/portal/admin/emails/accounts");
  return { ok: true };
}

export async function deleteMailboxAction(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Missing mailbox name");
  await deleteMailbox(name);
  // The mailbox no longer exists in Plesk — drop its stored credentials and
  // every portal account's access to it too (cascades via MailboxAccess).
  await db.mailbox.deleteMany({ where: { address: `${name.toLowerCase()}@${mailDomain()}` } });
  revalidatePath("/portal/admin/emails/accounts");
  revalidatePath("/portal/profile");
}

export async function resetMailboxPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Missing mailbox name" };
  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) return { ok: false, error: password.error.errors[0]?.message };

  try {
    await resetMailboxPassword(name, password.data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to reset password" };
  }

  revalidatePath("/portal/admin/emails/accounts");
  return { ok: true };
}

export async function setForwardingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Missing mailbox name" };

  const raw = String(formData.get("targets") ?? "").trim();
  const targets = raw ? raw.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const t of targets) {
    if (!emailRe.test(t)) return { ok: false, error: `"${t}" is not a valid email address` };
  }

  try {
    await setMailboxForwarding(name, targets);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update forwarding" };
  }

  revalidatePath("/portal/admin/emails/accounts");
  return { ok: true };
}

export { mailDomain };
