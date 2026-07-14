"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { actionRole, actionUser } from "@/lib/guards";
import { deleteUpload } from "@/lib/storage";
import { computeTicketPricing } from "@/lib/pricing";
import type { ActionState } from "@/lib/actions/jobs";
import type { Prisma, User } from "@prisma/client";

/**
 * Service ticket wizard actions. Employees only ever touch their OWN drafts;
 * admins can touch any ticket. Submitting freezes the computed price onto
 * the ticket — techs cannot hand-edit the total, only admins can adjust it
 * after submission.
 */

function ticketWhere(user: User, id: string) {
  return user.role === "ADMIN" ? { id } : { id, techId: user.id };
}

async function editableTicket(user: User, id: string) {
  const ticket = await db.serviceTicket.findFirst({ where: ticketWhere(user, id) });
  if (!ticket) throw new Error("Not found");
  if (ticket.status === "SUBMITTED" && user.role !== "ADMIN") {
    throw new Error("Submitted tickets can only be changed by an admin");
  }
  return ticket;
}

export async function createTicketDraft(formData?: FormData): Promise<void> {
  const user = await actionRole("EMPLOYEE", "ADMIN");

  // Starting a ticket from a schedule event prefills it from the job.
  const jobId = formData ? String(formData.get("jobId") ?? "") : "";
  let jobData: Prisma.ServiceTicketCreateInput | null = null;
  if (jobId) {
    const job = await db.job.findFirst({
      where:
        user.role === "ADMIN"
          ? { id: jobId }
          : { id: jobId, assignments: { some: { userId: user.id } } },
    });
    if (!job) throw new Error("Job not found");
    jobData = {
      tech: { connect: { id: user.id } },
      job: { connect: { id: job.id } },
      ...(job.clientId ? { client: { connect: { id: job.clientId } } } : {}),
      customerName: job.customerName,
      serviceAddress: job.address,
      serviceDate: job.scheduledAt,
      // AM/PM-window jobs have no real times — the tech records actual
      // time in/out on site. Legacy exact-time jobs still prefill.
      ...(job.window ? {} : { timeIn: job.scheduledAt, timeOut: job.endAt }),
    };
  }

  const ticket = await db.serviceTicket.create({
    data: jobData ?? { tech: { connect: { id: user.id } }, serviceDate: new Date() },
  });
  redirect(`/portal/employee/tickets/${ticket.id}`);
}

export async function deleteTicketDraft(formData: FormData): Promise<void> {
  const user = await actionRole("EMPLOYEE", "ADMIN");
  const id = String(formData.get("ticketId") ?? "");
  const ticket = await db.serviceTicket.findFirst({
    where: { ...ticketWhere(user, id), ...(user.role === "ADMIN" ? {} : { status: "DRAFT" }) },
    include: { photos: true },
  });
  if (!ticket) throw new Error("Not found");

  await db.serviceTicket.delete({ where: { id: ticket.id } });
  // DB rows cascade; clean the photo files off disk too.
  for (const p of ticket.photos) await deleteUpload(p.storagePath);

  revalidatePath("/portal", "layout");
  redirect("/portal/employee/tickets");
}

/* --------------------------- Section saves ------------------------------- */

const str = (formData: FormData, key: string, max = 191) =>
  String(formData.get(key) ?? "").trim().slice(0, max) || null;

export async function saveTicketSection(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionRole("EMPLOYEE", "ADMIN");
  const id = String(formData.get("ticketId") ?? "");
  const section = String(formData.get("section") ?? "");

  let ticket;
  try {
    ticket = await editableTicket(user, id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Not found" };
  }

  const data: Prisma.ServiceTicketUpdateInput = {};

  if (section === "customer") {
    const clientId = str(formData, "clientId");
    if (clientId) {
      const client = await db.user.findFirst({ where: { id: clientId, role: "CLIENT" } });
      if (!client) return { ok: false, error: "Invalid customer" };
      data.client = { connect: { id: client.id } };
      // Autofill from the account, but let the tech override in the fields.
      data.customerName = str(formData, "customerName", 120) ?? client.name;
      data.serviceAddress = str(formData, "serviceAddress", 300) ?? client.address ?? "";
    } else {
      data.client = { disconnect: true };
      const name = str(formData, "customerName", 120);
      if (!name) return { ok: false, error: "Customer name is required" };
      data.customerName = name;
      data.serviceAddress = str(formData, "serviceAddress", 300) ?? "";
    }
    const dateRaw = str(formData, "serviceDate", 30);
    if (dateRaw) {
      const d = new Date(dateRaw);
      if (isNaN(d.getTime())) return { ok: false, error: "Invalid service date" };
      data.serviceDate = d;
    }
  } else if (section === "time") {
    const parseDT = (key: string) => {
      const raw = str(formData, key, 30);
      if (!raw) return null;
      const d = new Date(raw);
      return isNaN(d.getTime()) ? undefined : d;
    };
    const timeIn = parseDT("timeIn");
    const timeOut = parseDT("timeOut");
    if (timeIn === undefined || timeOut === undefined) return { ok: false, error: "Invalid time" };
    if (timeIn && timeOut && timeOut <= timeIn) return { ok: false, error: "Time out must be after time in" };
    data.timeIn = timeIn;
    data.timeOut = timeOut;
    data.zone = str(formData, "zone", 60);
    data.techCount = String(formData.get("techCount")) === "2" ? 2 : 1;
    data.ladderUsed = formData.get("ladderUsed") === "on";
    data.maintenanceVisit = formData.get("maintenanceVisit") === "on";
  } else if (section === "equipment") {
    data.systemType = str(formData, "systemType", 80);
    data.brand = str(formData, "brand", 80);
    data.modelNumber = str(formData, "modelNumber", 120);
    data.serialNumber = str(formData, "serialNumber", 120);
    const age = str(formData, "ageYears", 4);
    data.ageYears = age && Number.isInteger(Number(age)) ? Number(age) : null;
  } else if (section === "readings") {
    for (const key of [
      "capRated", "capTested", "suctionBefore", "suctionAfter", "liquidBefore", "liquidAfter",
      "superheat", "subcooling", "compressorAmps", "fanAmps", "supplyAirTemp", "refrigerantType",
    ] as const) {
      data[key] = str(formData, key, 60);
    }
    const lbs = str(formData, "refrigerantLbs", 10);
    if (lbs && !Number.isFinite(Number(lbs))) return { ok: false, error: "Refrigerant pounds must be a number" };
    data.refrigerantLbs = lbs ? Number(lbs) : null;
    data.readingsNotes = str(formData, "readingsNotes", 5000);
  } else if (section === "work") {
    data.workPerformed = str(formData, "workPerformed", 20000);
  } else if (section === "billing") {
    const status = String(formData.get("billingStatus"));
    if (!["BILLABLE", "NO_CHARGE", "NEEDS_REVIEW"].includes(status)) {
      return { ok: false, error: "Pick a billing status" };
    }
    data.billingStatus = status as "BILLABLE" | "NO_CHARGE" | "NEEDS_REVIEW";
    data.paidOnSite = formData.get("paidOnSite") === "on";
    data.paymentNote = str(formData, "paymentNote", 120);
  } else {
    return { ok: false, error: "Unknown section" };
  }

  await db.serviceTicket.update({ where: { id: ticket.id }, data });
  revalidatePath(`/portal/employee/tickets/${ticket.id}`);
  return { ok: true };
}

/* ------------------------------- Parts ----------------------------------- */

export async function addTicketPart(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionRole("EMPLOYEE", "ADMIN");
  const id = String(formData.get("ticketId") ?? "");
  const priceItemId = String(formData.get("priceItemId") ?? "");
  const qty = Number(formData.get("qty"));

  let ticket;
  try {
    ticket = await editableTicket(user, id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Not found" };
  }

  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: "Quantity must be a positive number" };
  const item = await db.priceBookItem.findFirst({ where: { id: priceItemId, active: true } });
  if (!item) return { ok: false, error: "Pick a part from the price book" };

  const unitPrice = Number(item.unitPrice);
  const label =
    item.unit === "PER_POUND"
      ? `${item.name} — ${qty} lb @ $${unitPrice.toFixed(2)}/lb`
      : `${item.name}${item.partNumber ? ` (#${item.partNumber})` : ""}`;

  await db.ticketLineItem.create({
    data: {
      ticketId: ticket.id,
      kind: "PART",
      label,
      qty,
      unitPrice,
      amount: Math.round(unitPrice * qty * 100) / 100,
      priceItemId: item.id,
    },
  });
  revalidatePath(`/portal/employee/tickets/${ticket.id}`);
  return { ok: true };
}

export async function removeTicketPart(formData: FormData): Promise<void> {
  const user = await actionRole("EMPLOYEE", "ADMIN");
  const lineId = String(formData.get("lineId") ?? "");

  const line = await db.ticketLineItem.findUnique({ where: { id: lineId }, include: { ticket: true } });
  if (!line || line.kind !== "PART") throw new Error("Not found");
  if (user.role !== "ADMIN" && (line.ticket.techId !== user.id || line.ticket.status !== "DRAFT")) {
    throw new Error("Forbidden");
  }

  await db.ticketLineItem.delete({ where: { id: lineId } });
  revalidatePath(`/portal/employee/tickets/${line.ticketId}`);
}

/* ------------------------------- Photos ---------------------------------- */

export async function deleteTicketPhoto(formData: FormData): Promise<void> {
  const user = await actionRole("EMPLOYEE", "ADMIN");
  const attachmentId = String(formData.get("attachmentId") ?? "");

  const att = await db.attachment.findUnique({ where: { id: attachmentId }, include: { serviceTicket: true } });
  if (!att?.serviceTicket) throw new Error("Not found");
  if (user.role !== "ADMIN" && att.serviceTicket.techId !== user.id) throw new Error("Forbidden");

  await db.attachment.delete({ where: { id: attachmentId } });
  await deleteUpload(att.storagePath);
  revalidatePath(`/portal/employee/tickets/${att.serviceTicket.id}`);
}

/* ------------------------------- Submit ---------------------------------- */

export async function submitTicket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionRole("EMPLOYEE", "ADMIN");
  const id = String(formData.get("ticketId") ?? "");

  const ticket = await db.serviceTicket.findFirst({
    where: ticketWhere(user, id),
    include: { lineItems: true },
  });
  if (!ticket) return { ok: false, error: "Not found" };
  if (ticket.status === "SUBMITTED") return { ok: false, error: "Already submitted" };

  // Required fields, independent of billing status.
  if (!ticket.customerName.trim()) return { ok: false, error: "Customer & Job: customer name is required" };
  if (!ticket.serviceAddress.trim()) return { ok: false, error: "Customer & Job: service address is required" };
  if (!ticket.workPerformed?.trim()) return { ok: false, error: "Work Performed: describe the work before submitting" };

  const pricing = await computeTicketPricing(ticket);

  // Billable tickets must price cleanly (or get flagged for manual pricing).
  if (ticket.billingStatus === "BILLABLE" && !pricing.needsManualPricing && pricing.problems.length > 0) {
    return { ok: false, error: `Time & Labor: ${pricing.problems[0]}` };
  }

  const priceable = ticket.billingStatus !== "NEEDS_REVIEW" && !pricing.needsManualPricing;

  await db.$transaction([
    // Replace any previously computed labor/add-on lines; PART lines stay.
    db.ticketLineItem.deleteMany({ where: { ticketId: ticket.id, kind: { in: ["LABOR", "ADDON"] } } }),
    ...(priceable
      ? pricing.lines
          .filter((l) => l.kind !== "PART")
          .map((l) =>
            db.ticketLineItem.create({
              data: { ticketId: ticket.id, kind: l.kind, label: l.label, amount: l.amount },
            })
          )
      : []),
    db.serviceTicket.update({
      where: { id: ticket.id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        needsManualPricing: pricing.needsManualPricing,
        // NEEDS_REVIEW and manual-pricing tickets submit WITHOUT a locked price.
        laborTotal: priceable ? pricing.laborTotal : null,
        partsTotal: priceable ? pricing.partsTotal : null,
        total: priceable ? pricing.total : null,
      },
    }),
  ]);

  revalidatePath("/portal", "layout");
  return { ok: true };
}

/* ---------------------------- Admin review ------------------------------- */

/** Admin adjusts a submitted ticket's price / billing status after review. */
export async function adminAdjustTicket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");
  const id = String(formData.get("ticketId") ?? "");

  const ticket = await db.serviceTicket.findUnique({ where: { id } });
  if (!ticket) return { ok: false, error: "Not found" };

  const status = String(formData.get("billingStatus"));
  if (!["BILLABLE", "NO_CHARGE", "NEEDS_REVIEW"].includes(status)) {
    return { ok: false, error: "Pick a billing status" };
  }

  const totalRaw = String(formData.get("total") ?? "").trim();
  const total = totalRaw === "" ? null : Number(totalRaw);
  if (total !== null && (!Number.isFinite(total) || total < 0)) {
    return { ok: false, error: "Total must be a positive number" };
  }

  await db.serviceTicket.update({
    where: { id },
    data: {
      billingStatus: status as "BILLABLE" | "NO_CHARGE" | "NEEDS_REVIEW",
      total: status === "NO_CHARGE" ? 0 : total,
      needsManualPricing: false,
    },
  });
  revalidatePath("/portal", "layout");
  return { ok: true };
}

/** Admin sends a submitted ticket back to the tech as a draft. */
export async function reopenTicket(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const id = String(formData.get("ticketId") ?? "");
  await db.serviceTicket.updateMany({
    where: { id, status: "SUBMITTED" },
    data: { status: "DRAFT", submittedAt: null },
  });
  revalidatePath("/portal", "layout");
}
