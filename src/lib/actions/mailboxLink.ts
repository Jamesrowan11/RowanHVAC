"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { actionRole, actionUser } from "@/lib/guards";
import { encryptSecret, decryptSecret } from "@/lib/secretBox";
import { verifyMailboxCredentials, sendMailboxMessage } from "@/lib/mailbox";
import type { ActionState } from "@/lib/actions/jobs";

const addressSchema = z.string().trim().email("Enter a valid email address").max(255);
const passwordSchema = z.string().min(1, "Password is required").max(200);

/** Verifies the credentials actually work, then encrypts and stores them. */
async function saveLink(userId: string, address: string, password: string): Promise<ActionState> {
  const check = await verifyMailboxCredentials(address, password);
  if (!check.ok) {
    return { ok: false, error: `Couldn't connect with those credentials: ${check.error}` };
  }
  await db.mailboxLink.upsert({
    where: { userId },
    create: { userId, address, encryptedPassword: encryptSecret(password) },
    update: { address, encryptedPassword: encryptSecret(password) },
  });
  return { ok: true };
}

/** Self-service: link the CURRENT user's own mailbox — never a target id. */
export async function linkMyMailboxAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser();
  const address = addressSchema.safeParse(formData.get("address"));
  if (!address.success) return { ok: false, error: address.error.errors[0]?.message };
  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) return { ok: false, error: password.error.errors[0]?.message };

  const result = await saveLink(user.id, address.data, password.data);
  if (result.ok) revalidatePath("/portal/profile");
  return result;
}

/** Admin-assisted: link a mailbox to any staff (Admin/Employee) account. */
export async function adminLinkMailboxAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");

  const userId = String(formData.get("userId") ?? "");
  const target = await db.user.findFirst({
    where: { id: userId, role: { in: ["ADMIN", "EMPLOYEE"] } },
  });
  if (!target) return { ok: false, error: "Pick a valid staff account" };

  const address = addressSchema.safeParse(formData.get("address"));
  if (!address.success) return { ok: false, error: address.error.errors[0]?.message };
  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) return { ok: false, error: password.error.errors[0]?.message };

  const result = await saveLink(target.id, address.data, password.data);
  if (result.ok) revalidatePath("/portal/admin/email-accounts");
  return result;
}

/** Unlink: admins can unlink anyone; everyone else only their own. */
export async function unlinkMailboxAction(formData: FormData): Promise<void> {
  const user = await actionUser();
  const targetUserId = String(formData.get("userId") ?? user.id);

  if (user.role !== "ADMIN" && targetUserId !== user.id) {
    throw new Error("Forbidden");
  }
  await db.mailboxLink.deleteMany({ where: { userId: targetUserId } });
  revalidatePath("/portal/profile");
  revalidatePath("/portal/admin/email-accounts");
}

/** Send a message through the CURRENT user's own linked mailbox. */
export async function sendFromMyMailboxAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser();
  const link = await db.mailboxLink.findUnique({ where: { userId: user.id } });
  if (!link) return { ok: false, error: "No mailbox linked to your account" };

  const to = addressSchema.safeParse(formData.get("to"));
  if (!to.success) return { ok: false, error: to.error.errors[0]?.message };
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 300);
  const body = String(formData.get("body") ?? "").trim().slice(0, 20000);
  if (!subject) return { ok: false, error: "Subject is required" };
  if (!body) return { ok: false, error: "Message is required" };

  try {
    await sendMailboxMessage(link.address, decryptSecret(link.encryptedPassword), {
      to: to.data,
      subject,
      body,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to send" };
  }

  return { ok: true };
}
