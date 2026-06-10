"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { actionRole } from "@/lib/guards";
import { notify } from "@/lib/email";

export async function deleteRequest(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  await db.quoteRequest.deleteMany({ where: { id } });
  revalidatePath("/portal", "layout");
}

export async function closeRequest(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  await db.quoteRequest.updateMany({ where: { id }, data: { status: "CLOSED" } });
  revalidatePath("/portal", "layout");
}

const portalRequestSchema = z.object({
  service: z.string().trim().min(1, "Please choose a service").max(120),
  message: z.string().trim().min(1, "Please describe what you need").max(5000),
});

export type RequestFormState = { ok: boolean; error?: string };

/** A logged-in client submits a service/quote request from their dashboard. */
export async function submitPortalRequest(
  _prev: RequestFormState,
  formData: FormData
): Promise<RequestFormState> {
  const user = await actionRole("CLIENT");

  const parsed = portalRequestSchema.safeParse({
    service: formData.get("service"),
    message: formData.get("message"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  await db.quoteRequest.create({
    data: {
      name: user.name,
      phone: user.phone ?? "",
      email: user.email,
      service: parsed.data.service,
      message: parsed.data.message,
      source: "PORTAL",
      clientId: user.id,
    },
  });

  const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { email: true } });
  if (admins.length > 0) {
    notify({
      to: admins.map((a) => a.email),
      subject: `Portal request from ${user.name}: ${parsed.data.service}`,
      body: `${user.name} submitted a new request from the client portal.\n\nService: ${parsed.data.service}\n\nMessage:\n${parsed.data.message}\n\nReview it here: ${process.env.APP_URL || ""}/portal/admin/requests`,
    });
  }

  revalidatePath("/portal", "layout");
  return { ok: true };
}

/** Clients with an active maintenance policy can request a maintenance visit. */
export async function scheduleMaintenance(
  _prev: RequestFormState,
  formData: FormData
): Promise<RequestFormState> {
  const user = await actionRole("CLIENT");

  // Policy check is on the server — no policy, no self-scheduling.
  if (!user.policyActive) {
    return { ok: false, error: "No active maintenance policy on file. Please contact us to enroll." };
  }

  const preferred = String(formData.get("preferred") ?? "").trim().slice(0, 300);
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000);

  await db.quoteRequest.create({
    data: {
      name: user.name,
      phone: user.phone ?? "",
      email: user.email,
      service: "Maintenance visit (service agreement)",
      message: `Preferred time: ${preferred || "no preference"}${notes ? `\n\n${notes}` : ""}`,
      source: "MAINTENANCE",
      clientId: user.id,
    },
  });

  const admins = await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { email: true } });
  if (admins.length > 0) {
    notify({
      to: admins.map((a) => a.email),
      subject: `Maintenance request from ${user.name}`,
      body: `${user.name} (active maintenance policy) requested a maintenance visit.\n\nPreferred time: ${preferred || "no preference"}\n${notes ? `Notes: ${notes}\n` : ""}\nTurn it into a job here: ${process.env.APP_URL || ""}/portal/admin/requests`,
    });
  }

  revalidatePath("/portal", "layout");
  return { ok: true };
}
