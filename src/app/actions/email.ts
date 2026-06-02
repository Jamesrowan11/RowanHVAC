"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { sendEmail, parseRecipients, MAX_RECIPIENTS } from "@/lib/email";

export type ComposeState = { ok: boolean; error?: string; message?: string };

/**
 * Compose & send an email. Available to ADMIN and EMPLOYEE.
 * Recipients come from selected portal users AND/OR typed addresses.
 * Capped at MAX_RECIPIENTS (individual correspondence, not bulk).
 */
export async function composeEmail(
  _prev: ComposeState,
  formData: FormData,
): Promise<ComposeState> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "EMPLOYEE")) {
    return { ok: false, error: "Not authorized." };
  }

  const subject = String(formData.get("subject") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const typed = String(formData.get("typedRecipients") || "");
  const selectedIds = formData.getAll("userIds").map(String).filter(Boolean);

  if (!subject || !body) {
    return { ok: false, error: "Subject and message are required." };
  }

  // Resolve selected portal users. Employees may only email CLIENTs.
  const allowedRoles =
    user.role === "ADMIN"
      ? (["CLIENT", "EMPLOYEE", "ADMIN"] as const)
      : (["CLIENT"] as const);

  const selectedUsers = selectedIds.length
    ? await prisma.user.findMany({
        where: { id: { in: selectedIds }, role: { in: allowedRoles as never } },
        select: { email: true },
      })
    : [];

  const { valid, invalid } = parseRecipients(typed);
  if (invalid.length) {
    return {
      ok: false,
      error: `These addresses look invalid: ${invalid.join(", ")}`,
    };
  }

  const all = Array.from(
    new Set([...selectedUsers.map((u) => u.email), ...valid]),
  );

  if (all.length === 0) {
    return { ok: false, error: "Add at least one recipient." };
  }
  if (all.length > MAX_RECIPIENTS) {
    return {
      ok: false,
      error: `This is for individual correspondence — at most ${MAX_RECIPIENTS} recipients.`,
    };
  }

  const { status } = await sendEmail({
    to: all,
    subject,
    body,
    senderUserId: user.id,
    appendSignature: true,
  });

  return {
    ok: true,
    message:
      status === "SENT"
        ? `Email sent to ${all.length} recipient(s).`
        : status === "LOGGED"
          ? `Email logged to the server console for ${all.length} recipient(s) (no email provider configured).`
          : "The email provider reported a failure — see the Sent history.",
  };
}
