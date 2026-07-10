"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { notify } from "@/lib/email";
import { notifySms } from "@/lib/sms";
import { fmtDateTime } from "@/lib/queries";
import { COMPANY } from "@/lib/constants";

/**
 * Public, token-authenticated customer response to a "you're next" prompt.
 * No login required — the random token in the link is the authorization, so
 * there's no user data exposed and nothing to enumerate.
 */
export async function respondNextUp(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const choice = String(formData.get("choice") ?? "");
  if (!token || !["READY", "WAIT"].includes(choice)) return;

  const job = await db.job.findUnique({
    where: { confirmToken: token },
    include: { assignments: true, client: true },
  });
  if (!job) return;

  await db.job.update({
    where: { id: job.id },
    data: { confirmStatus: choice, confirmRespondedAt: new Date() },
  });

  const who = job.client?.name ?? job.customerName;
  const verdict =
    choice === "READY"
      ? `${who} is ready — okay to come now.`
      : `${who} would prefer to WAIT for a later time. Please follow up.`;

  // Tell the assigned technicians (if any) and the office.
  const assignedIds = job.assignments.map((a) => a.userId);
  const recipients = await db.user.findMany({
    where: {
      OR: [
        ...(assignedIds.length ? [{ id: { in: assignedIds } }] : []),
        { role: "ADMIN" as const, active: true },
      ],
    },
    select: { id: true, email: true, phone: true },
  });
  const emails = [...new Set(recipients.map((r) => r.email))];
  const phones = [...new Set(recipients.map((r) => r.phone).filter((p): p is string => !!p))];

  notify({
    to: emails,
    subject: `Customer response: ${choice === "READY" ? "ready now" : "wants to wait"} — ${who}`,
    body: `${verdict}\n\nJob: ${job.service}\nWhen: ${fmtDateTime(job.scheduledAt)}\nAddress: ${job.address}`,
  });
  if (phones.length > 0) {
    notifySms({ to: phones, body: `${COMPANY.shortName}: ${verdict} (${job.service})` });
  }

  // Attribute the auto-generated note to an assigned tech if there is one,
  // otherwise to whichever admin was notified (the job always has an admin
  // recipient, so this is only null if there are no active admins at all).
  const noteAuthorId = assignedIds[0] ?? recipients[0]?.id;
  if (noteAuthorId) {
    await db.jobNote.create({
      data: {
        jobId: job.id,
        authorId: noteAuthorId,
        body: choice === "READY" ? "✅ Customer confirmed: ready now." : "⏳ Customer asked to wait for a later time.",
      },
    });
  }

  revalidatePath("/portal", "layout");
}
