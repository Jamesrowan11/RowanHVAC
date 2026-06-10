"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { actionRole } from "@/lib/guards";
import { sendEmail } from "@/lib/email";
import { MAX_EMAIL_RECIPIENTS } from "@/lib/constants";
import type { ActionState } from "@/lib/actions/jobs";

const emailAddress = z.string().trim().email();

/**
 * Compose email from the portal. Admins may address any portal user;
 * employees may address clients only (plus typed addresses). Recipients are
 * capped — this is individual correspondence, not a bulk mailer.
 */
export async function composeEmail(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const sender = await actionRole("ADMIN", "EMPLOYEE");

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!subject) return { ok: false, error: "Subject is required" };
  if (!body) return { ok: false, error: "Message body is required" };

  // Selected portal users (validated against role scope server-side).
  const userIds = formData.getAll("userIds").map(String).filter(Boolean);
  const allowedRoles =
    sender.role === "ADMIN" ? ["ADMIN", "EMPLOYEE", "CLIENT"] : ["CLIENT"];
  const selectedUsers = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds }, active: true, role: { in: allowedRoles as never } },
        select: { id: true, email: true },
      })
    : [];
  if (selectedUsers.length !== userIds.length) {
    return { ok: false, error: "One or more selected recipients are not allowed" };
  }

  // Typed addresses: comma-separated, each validated.
  const typedRaw = String(formData.get("typed") ?? "").trim();
  const typed = typedRaw
    ? typedRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  for (const addr of typed) {
    if (!emailAddress.safeParse(addr).success) {
      return { ok: false, error: `"${addr}" is not a valid email address` };
    }
  }

  const recipients = [...new Set([...selectedUsers.map((u) => u.email), ...typed])];
  if (recipients.length === 0) return { ok: false, error: "Add at least one recipient" };
  if (recipients.length > MAX_EMAIL_RECIPIENTS) {
    return { ok: false, error: `Too many recipients (max ${MAX_EMAIL_RECIPIENTS})` };
  }

  const result = await sendEmail({
    senderUserId: sender.id,
    to: recipients,
    subject: subject.slice(0, 300),
    body: body.slice(0, 20000),
  });

  revalidatePath("/portal", "layout");
  if (!result.ok) return { ok: false, error: `Send failed: ${result.error ?? "unknown error"}` };
  return { ok: true };
}
