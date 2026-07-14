import { db } from "@/lib/db";

/**
 * The customer-facing scheduling letter / service agreement. It's a TEMPLATE:
 * the office edits one master copy (Price Book -> Service agreement) with
 * {{placeholders}}, and every job renders its own personalized letter from it
 * at send time. The rendered letter is snapshotted on the job (termsSnapshot)
 * so it can be hand-edited per customer and so later template edits never
 * change what someone already signed.
 *
 * Placeholders:
 *   {{customer_name}}    — the name on the job ("Mr. Davison")
 *   {{address}}          — the service address
 *   {{date}}             — the appointment date, long form ("July 16, 2026")
 *   {{first_rate}}       — labor rate for the first 30 minutes, from the
 *                          Local Areas labor table ("$199.00")
 *   {{additional_rate}}  — each additional 15-minute segment ("$53.00")
 */

export const DEFAULT_AGREEMENT_TEMPLATE = `Good Afternoon {{customer_name}}:

As requested, I have scheduled your service at {{address}} for {{date}}.

Our labor charges are as follows (per technician): {{first_rate}} for the first 30 minutes and {{additional_rate}} for each additional 15-minute segment or part of. This labor service charge will start over each time our service technician visits your property.

If you call around 9:15 a.m., the morning of, we will be able to let you know what number you are in the lineup.

We want our service to be the best value to our customers. To avoid additional labor charges while our technician looks for parking, please be sure parking is available directly at your location. Also, please be sure the front and around the units are clear so our technician can service the equipment. For liability purposes, he will not move these items.

Our technician will be calling on his cell phone. The number on your caller ID will be his cell number, not our office number. Please be sure to answer so that he can come to the appointment. If we cannot get in touch with you, he will have to move on to the next service call.

Please let us know below how you will be paying — by check or by credit card at the time of service. Our technician will have a credit card slider. If there is no response, we will not be able to dispatch a technician to service your equipment.`;

/** "July 16, 2026" — the long date style used in the letter. */
export function fmtLetterDate(d: Date, window?: string | null): string {
  const date = d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return window ? `${date} (${window} arrival)` : date;
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** First-30-minutes and per-15-minute rates, straight from the labor table. */
async function letterRates(): Promise<{ firstRate: string; additionalRate: string }> {
  const rows = await db.laborRate.findMany({
    where: { zone: "Local Areas", minutes: { in: [30, 45] } },
  });
  const at = (m: number) => {
    const r = rows.find((x) => x.minutes === m);
    return r ? Number(r.price) : null;
  };
  const first = at(30) ?? 199;
  const next = at(45);
  return {
    firstRate: money(first),
    additionalRate: money(next !== null ? next - first : 53),
  };
}

/** Replace {{placeholder}} tokens (whitespace-tolerant) in the template. */
export function renderAgreement(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, key: string) => {
    const v = vars[key.toLowerCase()];
    return v !== undefined ? v : whole;
  });
}

/** The master template (admin-edited, falling back to the built-in sample). */
export async function currentAgreementTemplate(): Promise<string> {
  const row = await db.setting.findUnique({ where: { key: "terms.agreementText" } });
  return row?.value?.trim() ? row.value : DEFAULT_AGREEMENT_TEMPLATE;
}

type JobForLetter = {
  customerName: string;
  address: string;
  scheduledAt: Date;
  window?: string | null;
};

/** Render the personalized letter for a job from the current master template. */
export async function renderedAgreementForJob(job: JobForLetter): Promise<string> {
  const [template, rates] = await Promise.all([currentAgreementTemplate(), letterRates()]);
  return renderAgreement(template, {
    customer_name: job.customerName,
    address: job.address,
    date: fmtLetterDate(job.scheduledAt, job.window),
    first_rate: rates.firstRate,
    additional_rate: rates.additionalRate,
  });
}
