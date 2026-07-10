"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { notify } from "@/lib/email";
import { fmtDateTime, fmtWhen } from "@/lib/queries";

/**
 * Public, token-authenticated acceptance of the pricing terms + service
 * agreement. Like /confirm, the random token in the link IS the
 * authorization — no login needed. The customer checks the acceptance box
 * and types their name as a signature; both are kept on the job, alongside
 * the snapshot of the exact agreement text they were shown.
 */
export async function acceptTerms(
  _prev: { ok: boolean; error?: string },
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const token = String(formData.get("token") ?? "");
  const signature = String(formData.get("signature") ?? "").trim().slice(0, 120);
  const agreed = formData.get("agree") === "on";

  if (!token) return { ok: false, error: "Invalid link" };
  if (!agreed) return { ok: false, error: "Please check the box to accept the pricing terms and agreement" };
  if (signature.length < 2) return { ok: false, error: "Please type your full name as your signature" };

  const job = await db.job.findUnique({ where: { acceptToken: token } });
  if (!job) return { ok: false, error: "This link is no longer valid" };
  if (job.termsAcceptedAt) return { ok: true };

  await db.job.update({
    where: { id: job.id },
    data: { termsAcceptedAt: new Date(), termsSignature: signature },
  });

  // Let the office know the terms were signed off.
  const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { email: true } });
  if (admins.length > 0) {
    notify({
      to: admins.map((a) => a.email),
      subject: `Terms accepted: ${job.customerName} — ${job.service}`,
      body: `${job.customerName} accepted the pricing terms and service agreement for ${job.service} on ${fmtWhen(job.scheduledAt, job.window)}.\n\nSigned: ${signature}\nAccepted: ${fmtDateTime(new Date())}`,
    });
  }

  revalidatePath("/portal", "layout");
  return { ok: true };
}
