"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { actionRole, actionUser } from "@/lib/guards";
import { notify } from "@/lib/email";
import { notifySms } from "@/lib/sms";
import { notifyPush } from "@/lib/push";
import { saveAttachments } from "@/lib/attachments";
import { fmtDateTime } from "@/lib/queries";
import { COMPANY } from "@/lib/constants";

export type ActionState = { ok: boolean; error?: string };

const jobSchema = z.object({
  customerName: z.string().trim().min(1, "Customer name is required").max(120),
  address: z.string().trim().min(1, "Address is required").max(300),
  service: z.string().trim().min(1, "Service is required").max(200),
  kind: z.enum(["SERVICE", "PICKUP"]).default("SERVICE"),
  scheduledAt: z.coerce.date(),
  endAt: z.coerce.date().optional(),
  technicianId: z.string().optional(), // optional — often assigned day-of
  clientId: z.string().optional(),
  requestId: z.string().optional(),
});

export async function createJob(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");

  const parsed = jobSchema.safeParse({
    customerName: formData.get("customerName"),
    address: formData.get("address"),
    service: formData.get("service"),
    kind: formData.get("kind") || "SERVICE",
    scheduledAt: formData.get("scheduledAt"),
    endAt: formData.get("endAt") || undefined,
    technicianId: formData.get("technicianId"),
    clientId: formData.get("clientId") || undefined,
    requestId: formData.get("requestId") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  // Technician is optional — many jobs get assigned the day of. If one was
  // picked, it must be active staff (employee or admin).
  let tech: { id: string; name: string; email: string; phone: string | null } | null = null;
  if (data.technicianId) {
    tech = await db.user.findFirst({
      where: { id: data.technicianId, active: true, role: { in: ["EMPLOYEE", "ADMIN"] } },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!tech) return { ok: false, error: "Invalid technician" };
  }

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
      kind: data.kind,
      scheduledAt: data.scheduledAt,
      endAt: data.endAt ?? null,
      technicianId: tech?.id ?? null,
      clientId,
    },
    include: { client: true },
  });

  const label = data.kind === "PICKUP" ? "Pickup" : "Job";

  // If this job came from a quote request, mark the request handled.
  if (data.requestId) {
    await db.quoteRequest.updateMany({
      where: { id: data.requestId },
      data: { status: "CONVERTED" },
    });
  }

  // Automation: notify the technician (if one was assigned already) and, if
  // linked, the client — by email + SMS.
  const when = fmtDateTime(job.scheduledAt);
  if (tech) {
    notify({
      to: [tech.email],
      subject: `New ${label.toLowerCase()} assigned: ${job.service} on ${when}`,
      body: `Hi ${tech.name},\n\nA new ${label.toLowerCase()} has been assigned to you.\n\nCustomer: ${job.customerName}\nAddress: ${job.address}\nService: ${job.service}\nWhen: ${when}\n\nSee your schedule: ${process.env.APP_URL || ""}/portal/employee`,
    });
    if (tech.phone) {
      notifySms({
        to: [tech.phone],
        body: `${COMPANY.shortName}: new ${label.toLowerCase()} ${when} — ${job.customerName}, ${job.service} at ${job.address}.`,
      });
    }
    notifyPush([tech.id], {
      title: `New ${label.toLowerCase()} assigned`,
      body: `${when} — ${job.customerName}, ${job.service}`,
      url: `/portal/employee/jobs/${job.id}`,
    });
  }
  if (job.client) {
    notify({
      to: [job.client.email],
      subject: `Your appointment with ${COMPANY.shortName} is scheduled`,
      body: `Hi ${job.client.name},\n\nYour appointment is scheduled.\n\nService: ${job.service}\nWhen: ${when}\nAddress: ${job.address}\n\nIf you need to make a change, call us at ${COMPANY.phone} or reply through the portal.`,
    });
    if (job.client.phone) {
      notifySms({
        to: [job.client.phone],
        body: `${COMPANY.shortName}: your ${job.service} appointment is scheduled for ${when}. Questions? Call ${COMPANY.phone}.`,
      });
    }
    notifyPush([job.client.id], {
      title: "Appointment scheduled",
      body: `${job.service} — ${when}`,
      url: "/portal/client",
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

  // Automation: tell the client when work starts (email + SMS).
  if (status === "IN_PROGRESS" && job.client) {
    notify({
      to: [job.client.email],
      subject: `Your ${job.service} service is underway`,
      body: `Hi ${job.client.name},\n\nOur technician has started work on your ${job.service} at ${job.address}. We'll let you know as soon as it's complete.\n\nThank you for choosing ${COMPANY.name}.`,
    });
    if (job.client.phone) {
      notifySms({
        to: [job.client.phone],
        body: `${COMPANY.shortName}: our technician has started your ${job.service}. We'll update you when it's done.`,
      });
    }
  }

  // Automation: tell the client when their job is finished (email + SMS).
  if (status === "COMPLETED" && job.client) {
    notify({
      to: [job.client.email],
      subject: `Your ${job.service} service is complete`,
      body: `Hi ${job.client.name},\n\nGood news — today's service (${job.service}) at ${job.address} is complete.${summary ? `\n\nTechnician summary:\n${summary}` : ""}\n\nThank you for trusting ${COMPANY.name}.`,
    });
    if (job.client.phone) {
      notifySms({
        to: [job.client.phone],
        body: `${COMPANY.shortName}: your ${job.service} service is complete. Thank you for choosing us!`,
      });
    }
    notifyPush([job.client.id], {
      title: "Service complete",
      body: `Your ${job.service} is done.`,
      url: "/portal/client/history",
    });
  }

  revalidatePath("/portal", "layout");
}

/**
 * A tech who's free claims a job for today — either a teammate's still-
 * unstarted job, or one nobody's assigned yet. Reassigns it to themselves
 * and notifies whoever previously had it (if anyone) plus the office.
 */
export async function pickUpJob(formData: FormData): Promise<void> {
  const user = await actionRole("EMPLOYEE", "ADMIN");
  const jobId = String(formData.get("jobId") ?? "");

  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay); endOfDay.setDate(endOfDay.getDate() + 1);

  // Any still-scheduled (unstarted) job for today — a teammate's, or unassigned.
  const job = await db.job.findFirst({
    where: {
      id: jobId,
      status: "SCHEDULED",
      scheduledAt: { gte: startOfDay, lt: endOfDay },
    },
    include: { technician: true },
  });
  if (!job || job.technicianId === user.id) throw new Error("This job isn't available to pick up");

  const previousTech = job.technician;

  await db.job.update({ where: { id: job.id }, data: { technicianId: user.id } });
  await db.jobNote.create({
    data: {
      jobId: job.id,
      authorId: user.id,
      body: previousTech
        ? `🤝 Picked up by ${user.name} (was assigned to ${previousTech.name}).`
        : `🤝 Picked up by ${user.name} (was unassigned).`,
    },
  });

  // Let the original tech (if any) and the office know about the reassignment.
  const admins = await db.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { id: true, email: true },
  });
  const emailTargets = [...(previousTech ? [previousTech.email] : []), ...admins.map((a) => a.email)];
  notify({
    to: emailTargets,
    subject: `Job picked up: ${job.service} for ${job.customerName}`,
    body: `${user.name} picked up the ${job.service} job for ${job.customerName} (${fmtDateTime(job.scheduledAt)})${previousTech ? ` — previously assigned to ${previousTech.name}` : " — it was unassigned"}.`,
  });
  notifyPush([...(previousTech ? [previousTech.id] : []), ...admins.map((a) => a.id)], {
    title: "Job picked up",
    body: `${user.name} took the ${job.service} for ${job.customerName}.`,
    url: "/portal/employee",
  });

  revalidatePath("/portal", "layout");
}

/** Admin assigns (or reassigns) a technician on any job — the usual "day of" step. */
export async function assignTechnician(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const jobId = String(formData.get("jobId") ?? "");
  const technicianId = String(formData.get("technicianId") ?? "");

  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Not found");

  const tech = await db.user.findFirst({
    where: { id: technicianId, active: true, role: { in: ["EMPLOYEE", "ADMIN"] } },
  });
  if (!tech) throw new Error("Invalid technician");

  await db.job.update({ where: { id: job.id }, data: { technicianId: tech.id } });
  await db.jobNote.create({
    data: { jobId: job.id, authorId: tech.id, body: `📌 Assigned to ${tech.name}.` },
  });

  const when = fmtDateTime(job.scheduledAt);
  notify({
    to: [tech.email],
    subject: `Job assigned: ${job.service} on ${when}`,
    body: `Hi ${tech.name},\n\nYou've been assigned a job.\n\nCustomer: ${job.customerName}\nAddress: ${job.address}\nService: ${job.service}\nWhen: ${when}\n\nSee your schedule: ${process.env.APP_URL || ""}/portal/employee`,
  });
  if (tech.phone) {
    notifySms({
      to: [tech.phone],
      body: `${COMPANY.shortName}: you've been assigned ${job.service} for ${job.customerName} at ${when}.`,
    });
  }
  notifyPush([tech.id], {
    title: "Job assigned",
    body: `${when} — ${job.customerName}, ${job.service}`,
    url: `/portal/employee/jobs/${job.id}`,
  });

  revalidatePath("/portal", "layout");
}

/** Quick "on my way" update a tech (or admin) sends the customer en route. */
export async function notifyOnMyWay(formData: FormData): Promise<void> {
  const user = await actionUser();
  const jobId = String(formData.get("jobId") ?? "");
  const eta = String(formData.get("eta") ?? "").trim().slice(0, 60);

  const where =
    user.role === "ADMIN"
      ? { id: jobId }
      : user.role === "EMPLOYEE"
        ? { id: jobId, technicianId: user.id }
        : null;
  if (!where) throw new Error("Forbidden");

  const job = await db.job.findFirst({ where, include: { client: true } });
  if (!job) throw new Error("Not found");

  const etaText = eta ? ` We expect to arrive in about ${eta}.` : "";
  if (job.client) {
    notify({
      to: [job.client.email],
      subject: `Your ${COMPANY.shortName} technician is on the way`,
      body: `Hi ${job.client.name},\n\nYour technician is on the way for your ${job.service} appointment at ${job.address}.${etaText}\n\nSee you soon!`,
    });
    if (job.client.phone) {
      notifySms({
        to: [job.client.phone],
        body: `${COMPANY.shortName}: your technician is on the way for your ${job.service} appointment.${etaText}`,
      });
    }
  }
  // Log it on the job so the office sees the customer was notified.
  await db.jobNote.create({
    data: { jobId: job.id, authorId: user.id, body: `📍 Notified customer: on the way.${etaText}` },
  });
  revalidatePath("/portal", "layout");
}

/**
 * Ask the customer to confirm being the technician's next stop. Sends a
 * tokenized link by email + SMS with two choices: ready now, or wait.
 */
export async function askNextUp(formData: FormData): Promise<void> {
  const user = await actionUser();
  const jobId = String(formData.get("jobId") ?? "");

  const where =
    user.role === "ADMIN"
      ? { id: jobId }
      : user.role === "EMPLOYEE"
        ? { id: jobId, technicianId: user.id }
        : null;
  if (!where) throw new Error("Forbidden");

  const job = await db.job.findFirst({ where, include: { client: true } });
  if (!job) throw new Error("Not found");

  const token = crypto.randomUUID();
  await db.job.update({
    where: { id: job.id },
    data: { confirmToken: token, confirmStatus: "ASKED", confirmAskedAt: new Date(), confirmRespondedAt: null },
  });

  const link = `${process.env.APP_URL || ""}/confirm/${token}`;
  if (job.client) {
    notify({
      to: [job.client.email],
      subject: `You're next — ready for your ${job.service} appointment?`,
      body: `Hi ${job.client.name},\n\nOur technician is about ready to head your way for your ${job.service} appointment. Are you all set for us to come now, or would you prefer to wait for a later time?\n\nPlease let us know here:\n${link}\n\nThanks!\n${COMPANY.name}`,
    });
    if (job.client.phone) {
      notifySms({
        to: [job.client.phone],
        body: `${COMPANY.shortName}: you're next for your ${job.service}. OK to come now, or wait? Tap to let us know: ${link}`,
      });
    }
  }
  await db.jobNote.create({
    data: { jobId: job.id, authorId: user.id, body: "📨 Asked customer to confirm being next." },
  });
  revalidatePath("/portal", "layout");
}

export async function addJobNote(formData: FormData): Promise<void> {
  const user = await actionUser();
  const jobId = String(formData.get("jobId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!body && files.length === 0) return;

  const where =
    user.role === "ADMIN"
      ? { id: jobId }
      : user.role === "EMPLOYEE"
        ? { id: jobId, technicianId: user.id }
        : null;
  if (!where) throw new Error("Forbidden");

  const job = await db.job.findFirst({ where });
  if (!job) throw new Error("Not found");

  const note = await db.jobNote.create({
    data: { jobId: job.id, authorId: user.id, body: body.slice(0, 5000) || "(photo)" },
  });
  await saveAttachments(files, { jobNoteId: note.id, uploadedById: user.id });
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

  // Automation: the tech's schedule changed (if one was assigned); the client should know too.
  if (job.technician) {
    notify({
      to: [job.technician.email],
      subject: `Job cancelled: ${job.service} for ${job.customerName}`,
      body: `Hi ${job.technician.name},\n\nThe following job has been cancelled and removed from your schedule.\n\nCustomer: ${job.customerName}\nService: ${job.service}\nWas scheduled for: ${fmtDateTime(job.scheduledAt)}\nReason: ${reason}`,
    });
  }
  if (job.client) {
    notify({
      to: [job.client.email],
      subject: `Your appointment on ${fmtDateTime(job.scheduledAt)} was cancelled`,
      body: `Hi ${job.client.name},\n\nYour appointment (${job.service}) scheduled for ${fmtDateTime(job.scheduledAt)} has been cancelled.\n\nIf this is unexpected or you'd like to reschedule, call us at ${COMPANY.phone}.`,
    });
    if (job.client.phone) {
      notifySms({
        to: [job.client.phone],
        body: `${COMPANY.shortName}: your ${job.service} appointment on ${fmtDateTime(job.scheduledAt)} was cancelled. To reschedule call ${COMPANY.phone}.`,
      });
    }
    notifyPush([job.client.id], {
      title: "Appointment cancelled",
      body: `Your ${job.service} on ${fmtDateTime(job.scheduledAt)} was cancelled.`,
      url: "/portal/client",
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

  if (job.technician) {
    notify({
      to: [job.technician.email],
      subject: `Job reinstated: ${job.service} for ${job.customerName}`,
      body: `Hi ${job.technician.name},\n\nA previously cancelled job is back on your schedule.\n\nCustomer: ${job.customerName}\nService: ${job.service}\nWhen: ${fmtDateTime(job.scheduledAt)}`,
    });
  }

  revalidatePath("/portal", "layout");
}
