"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { notify } from "@/lib/email";
import { fmtDateTime, fmtWhen } from "@/lib/queries";

/**
 * Public, token-authenticated price acceptance. Like /confirm, the random
 * token in the link IS the authorization — no login needed. The customer
 * checks the acceptance box and types their name as a signature; both are
 * kept on the job as the record of acceptance.
 */
export async function acceptPrice(
  _prev: { ok: boolean; error?: string },
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const token = String(formData.get("token") ?? "");
  const signature = String(formData.get("signature") ?? "").trim().slice(0, 120);
  const agreed = formData.get("agree") === "on";

  if (!token) return { ok: false, error: "Invalid link" };
  if (!agreed) return { ok: false, error: "Please check the box to accept the price" };
  if (signature.length < 2) return { ok: false, error: "Please type your full name as your signature" };

  const job = await db.job.findUnique({ where: { acceptToken: token }, include: { client: true } });
  if (!job || job.quotedPrice == null) return { ok: false, error: "This link is no longer valid" };
  if (job.priceAcceptedAt) return { ok: true };

  await db.job.update({
    where: { id: job.id },
    data: { priceAcceptedAt: new Date(), priceSignature: signature },
  });

  // Let the office know the quote was signed off.
  const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { email: true } });
  if (admins.length > 0) {
    notify({
      to: admins.map((a) => a.email),
      subject: `Price accepted: ${job.customerName} — ${job.service}`,
      body: `${job.customerName} accepted the quoted price of $${Number(job.quotedPrice).toFixed(2)} for ${job.service} on ${fmtWhen(job.scheduledAt, job.window)}.\n\nSigned: ${signature}\nAccepted: ${fmtDateTime(new Date())}`,
    });
  }

  revalidatePath("/portal", "layout");
  return { ok: true };
}
