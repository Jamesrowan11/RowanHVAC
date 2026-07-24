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

/**
 * Credentials for one mailbox address are stored ONCE, on the Mailbox row —
 * granting a second (or third) portal account access to the same mailbox
 * never needs the password re-entered, since MailboxAccess just points at
 * the existing Mailbox record.
 */
async function connectAndGrant(address: string, password: string, userId: string): Promise<ActionState> {
  const check = await verifyMailboxCredentials(address, password);
  if (!check.ok) {
    return { ok: false, error: `Couldn't connect with those credentials: ${check.error}` };
  }
  const mailbox = await db.mailbox.upsert({
    where: { address },
    create: { address, encryptedPassword: encryptSecret(password) },
    update: { encryptedPassword: encryptSecret(password) },
  });
  await db.mailboxAccess.upsert({
    where: { userId_mailboxId: { userId, mailboxId: mailbox.id } },
    create: { userId, mailboxId: mailbox.id },
    update: {},
  });
  return { ok: true };
}

/** Self-service: connect (and get access to) a mailbox as the CURRENT user. */
export async function linkMyMailboxAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser();
  const address = addressSchema.safeParse(formData.get("address"));
  if (!address.success) return { ok: false, error: address.error.errors[0]?.message };
  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) return { ok: false, error: password.error.errors[0]?.message };

  const result = await connectAndGrant(address.data, password.data, user.id);
  if (result.ok) revalidatePath("/portal/mailbox");
  return result;
}

/** Admin, first time this mailbox has ever been connected: verify credentials, store them, grant the chosen staff member access. */
export async function adminConnectMailboxAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");

  const userId = String(formData.get("userId") ?? "");
  const target = await db.user.findFirst({ where: { id: userId, role: { in: ["ADMIN", "EMPLOYEE"] } } });
  if (!target) return { ok: false, error: "Pick a valid staff account" };

  const address = addressSchema.safeParse(formData.get("address"));
  if (!address.success) return { ok: false, error: address.error.errors[0]?.message };
  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) return { ok: false, error: password.error.errors[0]?.message };

  const result = await connectAndGrant(address.data, password.data, target.id);
  if (result.ok) revalidatePath("/portal/admin/emails/accounts");
  return result;
}

/** Admin, mailbox already connected: grant another staff member access — no password needed, credentials are already on file. */
export async function adminGrantMailboxAccessAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");

  const mailboxId = String(formData.get("mailboxId") ?? "");
  const mailbox = await db.mailbox.findUnique({ where: { id: mailboxId } });
  if (!mailbox) return { ok: false, error: "Mailbox not found" };

  const userId = String(formData.get("userId") ?? "");
  const target = await db.user.findFirst({ where: { id: userId, role: { in: ["ADMIN", "EMPLOYEE"] } } });
  if (!target) return { ok: false, error: "Pick a valid staff account" };

  await db.mailboxAccess.upsert({
    where: { userId_mailboxId: { userId: target.id, mailboxId } },
    create: { userId: target.id, mailboxId },
    update: {},
  });
  revalidatePath("/portal/admin/emails/accounts");
  return { ok: true };
}

/** Revoke one user's access to one mailbox. Admins can revoke anyone's; everyone else only their own. */
export async function unlinkMailboxAction(formData: FormData): Promise<void> {
  const user = await actionUser();
  const targetUserId = String(formData.get("userId") ?? user.id);
  const mailboxId = String(formData.get("mailboxId") ?? "");

  if (user.role !== "ADMIN" && targetUserId !== user.id) {
    throw new Error("Forbidden");
  }
  await db.mailboxAccess.deleteMany({ where: { userId: targetUserId, mailboxId } });
  revalidatePath("/portal/mailbox");
  revalidatePath("/portal/admin/emails/accounts");
}

/** Send a message through one of the CURRENT user's granted mailboxes. */
export async function sendFromMyMailboxAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser();
  const mailboxId = String(formData.get("mailboxId") ?? "");
  const access = await db.mailboxAccess.findUnique({
    where: { userId_mailboxId: { userId: user.id, mailboxId } },
    include: { mailbox: true },
  });
  if (!access) return { ok: false, error: "You don't have access to that mailbox" };

  const to = addressSchema.safeParse(formData.get("to"));
  if (!to.success) return { ok: false, error: to.error.errors[0]?.message };
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 300);
  const body = String(formData.get("body") ?? "").trim().slice(0, 20000);
  if (!subject) return { ok: false, error: "Subject is required" };
  if (!body) return { ok: false, error: "Message is required" };

  try {
    await sendMailboxMessage(access.mailbox.address, decryptSecret(access.mailbox.encryptedPassword), {
      to: to.data,
      subject,
      body,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to send" };
  }

  return { ok: true };
}
