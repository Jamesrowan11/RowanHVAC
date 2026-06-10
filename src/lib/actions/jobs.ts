"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { actionRole, actionUser } from "@/lib/guards";
import { notify } from "@/lib/email";
import { fmtDateTime } from "@/lib/queries";
import { COMPANY } from "@/lib/constants";

export type ActionState = { ok: boolean; error?: string };

const jobSchema = z.object({
  customerName: z.string().trim().min(1, "Customer name is required").max(120),
  address: z.string().trim().min(1, "Address is required").max(300),
  service: z.string().trim().min(1, "Service is required").max(200),
  scheduledAt: z.coerce.date(),
  technicianId: z.string().min(1, "Pick a technician"),
  clientId: z.string().optional(),
  requestId: z.string().optional(),
});

export async function createJob(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");

  const parsed = jobSchema.safeParse({
    customerName: formData.get("customerName"),
    address: formData.get("address"),
    service: formData.get("service"),
    scheduledAt: formData.get("scheduledAt"),
    technicianId: formData.get("technicianId"),
    clientId: formData.get("clientId") || undefined,
    requestId: formData.get("requestId") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  // Technicians must be active staff (employee or admin).
  const tech = await db.user.findFirst({
    where: { id: data.technicianId, active: true, role: { in: ["EMPLOYEE", "ADMIN"] } },
  });
  if (!tech) return { ok: false, error: "Invalid technician" };

  let clientId: string | null = null;
  if (data.clientId) {
    const client = await db.user.findFirst({ where: { id: data.clientId, role: "CLIENT" } });
    if (!client) return { ok: false, error: "Invalid client" };
    clientId = client.id;
  }

  const job = await db.job.create({
    data: {
      customerName: data.customerName,
      address: data.address,
      service: data.service,
      scheduledAt: data.scheduledAt,
      technicianId: tech.id,
      clientId,
    },
    include: { client: true },
  });

  // If this job came from a quote request, mark the request handled.
  if (data.requestId) {
    await db.quoteRequest.updateMany({
      where: { id: data.requestId },
      data: { status: "CONVERTED" },
    });
  }

  // Automation: notify the technician and (if linked) the client.
  const when = fmtDateTime(job.scheduledAt);
  notify({
    to: [tech.email],
    subject: `New job assigned: ${job.service} on ${when}`,
    body: `Hi ${tech.name},\n\nA new job has been assigned to you.\n\nCustomer: ${job.customerName}\nAddress: ${job.address}\nService: ${job.service}\nWhen: ${when}\n\nSee your schedule: ${process.env.APP_URL || ""}/portal/employee`,
  });
  if (job.client) {
    notify({
      to: [job.client.email],
      subject: `Your appointment with ${COMPANY.shortName} is scheduled`,
      body: `Hi ${job.client.name},\n\nYour appointment is scheduled.\n\nService: ${job.service}\nWhen: ${when}\nAddress: ${job.address}\n\nIf you need to make a change, call us at ${COMPANY.phone} or reply through the portal.`,
    });
  }

  revalidatePath("/portal", "layout");
  return { ok: true };
}

export async function updateJobStatus(formData: FormData): Promise<void> {
  const user = await actionUser();
  const jobId = String(formData.get("jobId") ?? "");
  const status = String(formData.get("status") ?? "");
  const summary = String(formData.get("summary") ?? "").trim();

  if (!["SCHEDULED", "IN_PROGRESS", "COMPLETED"].includes(status)) {
    throw new Error("Invalid status");
  }

  // Admins can update any job; employees only jobs assigned to them.
  // Scoping the WHERE clause means a forged jobId simply matches nothing.
  const where =
    user.role === "ADMIN"
      ? { id: jobId }
      : user.role === "EMPLOYEE"
        ? { id: jobId, technicianId: user.id }
        : null;
  if (!where) throw new Error("Forbidden");

  const job = await db.job.findFirst({ where, include: { client: true } });
  if (!job) throw new Error("Not found");
  if (job.status === "CANCELLED") throw new Error("Cancelled jobs must be reinstated by an admin");

  await db.job.update({
    where: { id: job.id },
    data: {
      status: status as "SCHEDULED" | "IN_PROGRESS" | "COMPLETED",
      completedAt: status === "COMPLETED" ? new Date() : null,
      ...(summary ? { summary } : {}),
    },
  });

  // Automation: tell the client when their job is finished.
  if (status === "COMPLETED" && job.client) {
    notify({
      to: [job.client.email],
      subject: `Your ${job.service} service is complete`,
      body: `Hi ${job.client.name},\n\nGood news — today's service (${job.service}) at ${job.address} is complete.${summary ? `\n\nTechnician summary:\n${summary}` : ""}\n\nThank you for trusting ${COMPANY.name}.`,
    });
  }

  revalidatePath("/portal", "layout");
}

export async function addJobNote(formData: FormData): Promise<void> {
  const user = await actionUser();
  const jobId = String(formData.get("jobId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const where =
    user.role === "ADMIN"
      ? { id: jobId }
      : user.role === "EMPLOYEE"
        ? { id: jobId, technicianId: user.id }
        : null;
  if (!where) throw new Error("Forbidden");

  const job = await db.job.findFirst({ where });
  if (!job) throw new Error("Not found");

  await db.jobNote.create({ data: { jobId: job.id, authorId: user.id, body: body.slice(0, 5000) } });
  revalidatePath("/portal", "layout");
}

export async function cancelJob(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const jobId = String(formData.get("jobId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("A cancellation reason is required");

  const job = await db.job.findUnique({ where: { id: jobId }, include: { client: true, technician: true } });
  if (!job) throw new Error("Not found");

  await db.job.update({
    where: { id: job.id },
    data: { status: "CANCELLED", cancelReason: reason.slice(0, 1000), cancelledAt: new Date() },
  });

  // Automation: the tech's schedule changed; the client should know too.
  notify({
    to: [job.technician.email],
    subject: `Job cancelled: ${job.service} for ${job.customerName}`,
    body: `Hi ${job.technician.name},\n\nThe following job has been cancelled and removed from your schedule.\n\nCustomer: ${job.customerName}\nService: ${job.service}\nWas scheduled for: ${fmtDateTime(job.scheduledAt)}\nReason: ${reason}`,
  });
  if (job.client) {
    notify({
      to: [job.client.email],
      subject: `Your appointment on ${fmtDateTime(job.scheduledAt)} was cancelled`,
      body: `Hi ${job.client.name},\n\nYour appointment (${job.service}) scheduled for ${fmtDateTime(job.scheduledAt)} has been cancelled.\n\nIf this is unexpected or you'd like to reschedule, call us at ${COMPANY.phone}.`,
    });
  }

  revalidatePath("/portal", "layout");
}

export async function reinstateJob(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const jobId = String(formData.get("jobId") ?? "");

  const job = await db.job.findUnique({ where: { id: jobId }, include: { technician: true } });
  if (!job || job.status !== "CANCELLED") throw new Error("Not found");

  await db.job.update({
    where: { id: job.id },
    data: { status: "SCHEDULED", cancelReason: null, cancelledAt: null },
  });

  notify({
    to: [job.technician.email],
    subject: `Job reinstated: ${job.service} for ${job.customerName}`,
    body: `Hi ${job.technician.name},\n\nA previously cancelled job is back on your schedule.\n\nCustomer: ${job.customerName}\nService: ${job.service}\nWhen: ${fmtDateTime(job.scheduledAt)}`,
  });

  revalidatePath("/portal", "layout");
}
