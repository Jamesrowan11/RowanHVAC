"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { actionRole, actionUser } from "@/lib/guards";
import { notify } from "@/lib/email";
import { notifyPush } from "@/lib/push";
import { saveUpload, deleteUpload, isAllowedUpload } from "@/lib/storage";
import { COMPANY } from "@/lib/constants";
import type { ActionState } from "@/lib/actions/jobs";

/* ------------------------------- Payments -------------------------------- */

const paymentSchema = z.object({
  clientId: z.string().min(1),
  url: z.string().trim().url("Paste a valid payment-link URL").max(2000),
  label: z.string().trim().max(200).optional(),
});

export async function addPaymentLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await actionRole("ADMIN");

  const parsed = paymentSchema.safeParse({
    clientId: formData.get("clientId"),
    url: formData.get("url"),
    label: formData.get("label") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };

  const client = await db.user.findFirst({ where: { id: parsed.data.clientId, role: "CLIENT" } });
  if (!client) return { ok: false, error: "Client not found" };

  await db.paymentLink.create({
    data: {
      clientId: client.id,
      url: parsed.data.url,
      label: parsed.data.label,
      createdById: admin.id,
    },
  });

  // Automation: the client gets the link by email immediately — at their
  // billing email when they've set one, plus their login email.
  notify({
    senderUserId: admin.id,
    to: [...new Set([client.billingEmail, client.email].filter((e): e is string => !!e))],
    subject: `Payment link from ${COMPANY.shortName}`,
    body: `Hi ${client.name},\n\nWe've sent you a payment link${parsed.data.label ? ` for: ${parsed.data.label}` : ""}.\n\nPay securely here: ${parsed.data.url}\n\nYou can also find this link any time under Documents & Payments in your portal: ${process.env.APP_URL || ""}/portal/client/billing\n\nQuestions? Call us at ${COMPANY.phone}.`,
  });
  notifyPush([client.id], {
    title: "New payment link",
    body: parsed.data.label ? `For: ${parsed.data.label}` : "A payment link is ready for you.",
    url: "/portal/client/billing",
  });

  revalidatePath("/portal", "layout");
  return { ok: true };
}

export async function markPaymentPaid(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  await db.paymentLink.updateMany({
    where: { id },
    data: { status: "PAID", paidAt: new Date() },
  });
  revalidatePath("/portal", "layout");
}

export async function deletePaymentLink(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  await db.paymentLink.deleteMany({ where: { id } });
  revalidatePath("/portal", "layout");
}

/* ------------------------------- Documents ------------------------------- */

export async function uploadDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await actionRole("ADMIN");

  const clientId = String(formData.get("clientId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file" };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "File too large (10 MB max)" };
  if (!isAllowedUpload(file.type)) return { ok: false, error: "Only PDF and image files are allowed" };

  const client = await db.user.findFirst({ where: { id: clientId, role: "CLIENT" } });
  if (!client) return { ok: false, error: "Client not found" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = await saveUpload(buffer, file.name, "documents");

  await db.document.create({
    data: {
      clientId: client.id,
      fileName: file.name,
      storagePath,
      mimeType: file.type,
      size: file.size,
      uploadedById: admin.id,
    },
  });

  // Automation: tell the client a new document is waiting.
  notify({
    senderUserId: admin.id,
    to: [client.email],
    subject: `New document from ${COMPANY.shortName}`,
    body: `Hi ${client.name},\n\nWe've shared a new document with you: ${file.name}\n\nView and download it under Documents & Payments in your portal: ${process.env.APP_URL || ""}/portal/client/billing`,
  });
  notifyPush([client.id], {
    title: "New document shared",
    body: file.name,
    url: "/portal/client/billing",
  });

  revalidatePath("/portal", "layout");
  return { ok: true };
}

export async function deleteDocument(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return;
  await db.document.delete({ where: { id } });
  await deleteUpload(doc.storagePath);
  revalidatePath("/portal", "layout");
}

/* ----------------------- Internal notes (never client-visible) ----------- */

export async function addCustomerNote(formData: FormData): Promise<void> {
  const user = await actionUser();
  const clientId = String(formData.get("clientId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  if (user.role === "CLIENT") throw new Error("Forbidden");

  if (user.role === "EMPLOYEE") {
    // An employee may add notes only for a customer on one of their jobs.
    const hasJob = await db.job.count({ where: { assignments: { some: { userId: user.id } }, clientId } });
    if (hasJob === 0) throw new Error("Forbidden");
  }

  await db.customerNote.create({
    data: { clientId, authorId: user.id, body: body.slice(0, 5000) },
  });
  revalidatePath("/portal", "layout");
}

export async function deleteCustomerNote(formData: FormData): Promise<void> {
  await actionRole("ADMIN"); // employees can view/add, never delete
  const id = String(formData.get("id") ?? "");
  await db.customerNote.deleteMany({ where: { id } });
  revalidatePath("/portal", "layout");
}

export async function addEmployeeNote(formData: FormData): Promise<void> {
  const admin = await actionRole("ADMIN"); // employee notes are admin-only
  const employeeId = String(formData.get("employeeId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  await db.employeeNote.create({
    data: { employeeId, authorId: admin.id, body: body.slice(0, 5000) },
  });
  revalidatePath("/portal", "layout");
}

export async function deleteEmployeeNote(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  await db.employeeNote.deleteMany({ where: { id } });
  revalidatePath("/portal", "layout");
}
