"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { actionRole, actionUser } from "@/lib/guards";
import { notify } from "@/lib/email";
import { notifySms } from "@/lib/sms";
import { notifyPush } from "@/lib/push";
import { saveAttachments } from "@/lib/attachments";
import { placeAnnouncementCall } from "@/lib/voice";
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
  technicianIds: z.array(z.string()).default([]), // optional — often assigned day-of, any number
  clientId: z.string().optional(),
  requestId: z.string().optional(),
  quotedPrice: z.coerce.number().min(0).max(1000000).optional(),
});

/** Deadline for accepting the quoted price: one day before the appointment. */
function acceptDeadline(scheduledAt: Date): Date {
  const d = new Date(scheduledAt);
  d.setDate(d.getDate() - 1);
  return d;
}

/** Email + text the customer their quoted price with the acceptance link. */
function sendPriceAcceptance(
  job: { id: string; service: string; address: string; scheduledAt: Date; acceptToken: string | null; quotedPrice: unknown },
  client: { id: string; name: string; email: string; phone: string | null }
) {
  if (!job.acceptToken || job.quotedPrice == null) return;
  const link = `${process.env.APP_URL || ""}/accept/${job.acceptToken}`;
  const price = `$${Number(job.quotedPrice).toFixed(2)}`;
  const deadline = fmtDateTime(acceptDeadline(job.scheduledAt));
  notify({
    to: [client.email],
    subject: `Please review and accept your quote — ${job.service} on ${fmtDateTime(job.scheduledAt)}`,
    body: `Hi ${client.name},\n\nYour ${job.service} appointment at ${job.address} is scheduled for ${fmtDateTime(job.scheduledAt)}.\n\nQuoted price: ${price}\n\nPlease review and accept the price by ${deadline} (one day before your appointment):\n${link}\n\nQuestions? Call us at ${COMPANY.phone}.\n\n${COMPANY.name}`,
  });
  if (client.phone) {
    notifySms({
      to: [client.phone],
      body: `${COMPANY.shortName}: please accept your ${price} quote for ${job.service} by ${deadline}. Tap: ${link}`,
    });
  }
  notifyPush([client.id], {
    title: "Please accept your quote",
    body: `${job.service} — ${price}`,
    url: link,
  });
}

export async function createJob(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");

  const parsed = jobSchema.safeParse({
    customerName: formData.get("customerName"),
    address: formData.get("address"),
    service: formData.get("service"),
    kind: formData.get("kind") || "SERVICE",
    scheduledAt: formData.get("scheduledAt"),
    endAt: formData.get("endAt") || undefined,
    technicianIds: formData.getAll("technicianIds").map(String).filter(Boolean),
    clientId: formData.get("clientId") || undefined,
    requestId: formData.get("requestId") || undefined,
    quotedPrice: formData.get("quotedPrice") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  // Technicians are optional — many jobs get assigned the day of. Any picked
  // must be active staff (employee or admin).
  const techs = data.technicianIds.length
    ? await db.user.findMany({
        where: { id: { in: data.technicianIds }, active: true, role: { in: ["EMPLOYEE", "ADMIN"] } },
        select: { id: true, name: true, email: true, phone: true },
      })
    : [];
  if (techs.length !== data.technicianIds.length) {
    return { ok: false, error: "One or more selected technicians are invalid" };
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
      clientId,
      assignments: { create: techs.map((t) => ({ userId: t.id })) },
      // A quoted price triggers the acceptance flow the moment the job is
      // scheduled (needs a linked portal client to send to).
      ...(data.quotedPrice != null && clientId
        ? { quotedPrice: data.quotedPrice, acceptToken: crypto.randomUUID(), priceSentAt: new Date() }
        : data.quotedPrice != null
          ? { quotedPrice: data.quotedPrice }
          : {}),
    },
    include: { client: true },
  });

  // Automation: send the price-acceptance request as soon as it's scheduled.
  if (job.acceptToken && job.client) {
    sendPriceAcceptance(job, job.client);
  }

  const label = data.kind === "PICKUP" ? "Pickup" : "Job";

  // If this job came from a quote request, mark the request handled.
  if (data.requestId) {
    await db.quoteRequest.updateMany({
      where: { id: data.requestId },
      data: { status: "CONVERTED" },
    });
  }

  // Automation: notify every assigned technician and, if linked, the client — by email + SMS.
  const when = fmtDateTime(job.scheduledAt);
  for (const tech of techs) {
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
  }
  if (techs.length > 0) {
    notifyPush(techs.map((t) => t.id), {
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
        ? { id: jobId, assignments: { some: { userId: user.id } } }
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
 * A tech who's free joins a job for today — either helping out on a
 * teammate's still-unstarted job, or taking one nobody's on yet. Adds them
 * as an additional assignee (doesn't remove anyone already on it) and
 * notifies the existing assignees plus the office.
 */
export async function pickUpJob(formData: FormData): Promise<void> {
  const user = await actionRole("EMPLOYEE", "ADMIN");
  const jobId = String(formData.get("jobId") ?? "");

  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay); endOfDay.setDate(endOfDay.getDate() + 1);

  // Any still-scheduled (unstarted) job for today that this user isn't
  // already on — a teammate's, or unassigned.
  const job = await db.job.findFirst({
    where: {
      id: jobId,
      status: "SCHEDULED",
      scheduledAt: { gte: startOfDay, lt: endOfDay },
      NOT: { assignments: { some: { userId: user.id } } },
    },
    include: { assignments: { include: { user: true } } },
  });
  if (!job) throw new Error("This job isn't available to pick up");

  const existingAssignees = job.assignments.map((a) => a.user);

  await db.jobAssignment.create({ data: { jobId: job.id, userId: user.id } });
  await db.jobNote.create({
    data: {
      jobId: job.id,
      authorId: user.id,
      body:
        existingAssignees.length > 0
          ? `🤝 ${user.name} joined this job (already assigned: ${existingAssignees.map((t) => t.name).join(", ")}).`
          : `🤝 Picked up by ${user.name} (was unassigned).`,
    },
  });

  // Let the existing assignees (if any) and the office know.
  const admins = await db.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { id: true, email: true },
  });
  const emailTargets = [...existingAssignees.map((t) => t.email), ...admins.map((a) => a.email)];
  notify({
    to: emailTargets,
    subject: `Job picked up: ${job.service} for ${job.customerName}`,
    body: `${user.name} joined the ${job.service} job for ${job.customerName} (${fmtDateTime(job.scheduledAt)})${existingAssignees.length > 0 ? ` — already assigned: ${existingAssignees.map((t) => t.name).join(", ")}` : " — it was unassigned"}.`,
  });
  notifyPush([...existingAssignees.map((t) => t.id), ...admins.map((a) => a.id)], {
    title: "Job picked up",
    body: `${user.name} joined the ${job.service} for ${job.customerName}.`,
    url: "/portal/employee",
  });

  revalidatePath("/portal", "layout");
}

/** Admin sets the full list of technicians assigned to a job — the usual "day of" step. Replaces whoever was assigned before. */
export async function assignTechnicians(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const jobId = String(formData.get("jobId") ?? "");
  const technicianIds = [...new Set(formData.getAll("technicianIds").map(String).filter(Boolean))];

  const job = await db.job.findUnique({
    where: { id: jobId },
    include: { assignments: true },
  });
  if (!job) throw new Error("Not found");

  const techs = await db.user.findMany({
    where: { id: { in: technicianIds }, active: true, role: { in: ["EMPLOYEE", "ADMIN"] } },
  });
  if (techs.length !== technicianIds.length) throw new Error("One or more selected technicians are invalid");

  const previousIds = new Set(job.assignments.map((a) => a.userId));
  const newIds = new Set(technicianIds);
  const added = techs.filter((t) => !previousIds.has(t.id));
  const removedIds = [...previousIds].filter((id) => !newIds.has(id));

  await db.$transaction([
    db.jobAssignment.deleteMany({ where: { jobId: job.id, userId: { in: removedIds } } }),
    ...added.map((t) =>
      db.jobAssignment.upsert({
        where: { jobId_userId: { jobId: job.id, userId: t.id } },
        create: { jobId: job.id, userId: t.id },
        update: {},
      })
    ),
  ]);

  // Only log/notify if something actually changed.
  if (added.length > 0 || removedIds.length > 0) {
    const names = techs.map((t) => t.name);
    await db.jobNote.create({
      data: {
        jobId: job.id,
        authorId: techs[0]?.id ?? removedIds[0],
        body: names.length > 0 ? `📌 Assigned to ${names.join(", ")}.` : "📌 Unassigned all technicians.",
      },
    });
  }

  // Only notify newly-added technicians — the rest were already on the job.
  const when = fmtDateTime(job.scheduledAt);
  for (const tech of added) {
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
  }
  if (added.length > 0) {
    notifyPush(added.map((t) => t.id), {
      title: "Job assigned",
      body: `${when} — ${job.customerName}, ${job.service}`,
      url: `/portal/employee/jobs/${job.id}`,
    });
  }

  revalidatePath("/portal", "layout");
}

/**
 * Automated heads-up call before the tech dials: rings the customer with a
 * short recorded message telling them their technician is about to call and
 * to please answer — so the real call doesn't get screened as spam.
 */
export async function announceCallAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser();
  const jobId = String(formData.get("jobId") ?? "");

  const where =
    user.role === "ADMIN"
      ? { id: jobId }
      : user.role === "EMPLOYEE"
        ? { id: jobId, assignments: { some: { userId: user.id } } }
        : null;
  if (!where) return { ok: false, error: "Forbidden" };

  const job = await db.job.findFirst({ where, include: { client: true } });
  if (!job) return { ok: false, error: "Not found" };
  if (!job.client?.phone) return { ok: false, error: "This customer has no phone number on file" };

  const result = await placeAnnouncementCall(
    job.client.phone,
    `Hello, this is ${COMPANY.name}. Your technician ${user.name} is about to call you about your ${job.service} appointment. Please answer the upcoming call. Thank you.`
  );
  if (!result.ok) return { ok: false, error: result.error };

  await db.jobNote.create({
    data: { jobId: job.id, authorId: user.id, body: "📞 Sent automated heads-up call — customer told to expect your call." },
  });
  revalidatePath("/portal", "layout");
  return { ok: true };
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
        ? { id: jobId, assignments: { some: { userId: user.id } } }
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
        ? { id: jobId, assignments: { some: { userId: user.id } } }
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
        ? { id: jobId, assignments: { some: { userId: user.id } } }
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

/** Admins can delete any job note; employees only their own. Attachments cascade with it. */
export async function deleteJobNote(formData: FormData): Promise<void> {
  const user = await actionUser();
  const noteId = String(formData.get("noteId") ?? "");

  const note = await db.jobNote.findUnique({ where: { id: noteId } });
  if (!note) throw new Error("Not found");
  if (user.role !== "ADMIN" && note.authorId !== user.id) throw new Error("Forbidden");

  await db.jobNote.delete({ where: { id: noteId } });
  revalidatePath("/portal", "layout");
}

export async function cancelJob(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const jobId = String(formData.get("jobId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("A cancellation reason is required");

  const job = await db.job.findUnique({
    where: { id: jobId },
    include: { client: true, assignments: { include: { user: true } } },
  });
  if (!job) throw new Error("Not found");

  await db.job.update({
    where: { id: job.id },
    data: { status: "CANCELLED", cancelReason: reason.slice(0, 1000), cancelledAt: new Date() },
  });

  // Automation: each assigned tech's schedule changed; the client should know too.
  for (const { user: tech } of job.assignments) {
    notify({
      to: [tech.email],
      subject: `Job cancelled: ${job.service} for ${job.customerName}`,
      body: `Hi ${tech.name},\n\nThe following job has been cancelled and removed from your schedule.\n\nCustomer: ${job.customerName}\nService: ${job.service}\nWas scheduled for: ${fmtDateTime(job.scheduledAt)}\nReason: ${reason}`,
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

  const job = await db.job.findUnique({
    where: { id: jobId },
    include: { assignments: { include: { user: true } } },
  });
  if (!job || job.status !== "CANCELLED") throw new Error("Not found");

  await db.job.update({
    where: { id: job.id },
    data: { status: "SCHEDULED", cancelReason: null, cancelledAt: null },
  });

  for (const { user: tech } of job.assignments) {
    notify({
      to: [tech.email],
      subject: `Job reinstated: ${job.service} for ${job.customerName}`,
      body: `Hi ${tech.name},\n\nA previously cancelled job is back on your schedule.\n\nCustomer: ${job.customerName}\nService: ${job.service}\nWhen: ${fmtDateTime(job.scheduledAt)}`,
    });
  }

  revalidatePath("/portal", "layout");
}

/**
 * Admin sets or changes the quoted price on a job. Changing the price
 * invalidates any earlier acceptance (it was for a different number) and
 * re-sends the acceptance request to the customer.
 */
export async function setQuotedPrice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");
  const jobId = String(formData.get("jobId") ?? "");
  const price = Number(formData.get("quotedPrice"));
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: "Enter a valid price" };

  const job = await db.job.findUnique({ where: { id: jobId }, include: { client: true } });
  if (!job) return { ok: false, error: "Not found" };
  if (!job.client) return { ok: false, error: "Link this job to a portal client first — the request is emailed to their account" };

  const updated = await db.job.update({
    where: { id: job.id },
    data: {
      quotedPrice: price,
      acceptToken: crypto.randomUUID(),
      priceSentAt: new Date(),
      priceAcceptedAt: null,
      priceSignature: null,
    },
  });
  sendPriceAcceptance(updated, job.client);

  revalidatePath("/portal", "layout");
  return { ok: true };
}

/** Admin re-sends the price-acceptance request (same price, same link). */
export async function resendPriceAcceptance(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const jobId = String(formData.get("jobId") ?? "");
  const job = await db.job.findUnique({ where: { id: jobId }, include: { client: true } });
  if (!job?.client || !job.acceptToken || job.quotedPrice == null) throw new Error("Nothing to send");

  await db.job.update({ where: { id: job.id }, data: { priceSentAt: new Date() } });
  sendPriceAcceptance(job, job.client);
  revalidatePath("/portal", "layout");
}

/** Permanently deletes a job — notes, attachments, and assignments cascade with it. Admin only. */
export async function deleteJob(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const jobId = String(formData.get("jobId") ?? "");

  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Not found");

  await db.job.delete({ where: { id: jobId } });
  revalidatePath("/portal", "layout");
  redirect("/portal/admin/schedule");
}
