import { prisma } from "@/lib/prisma";
import { COMPANY_SIGNATURE } from "@/lib/email";
import { notifyParticipants } from "@/lib/messaging";
import { decryptSecret, describeMailError, sendFromMailbox } from "@/lib/mailbox";
import { rateLimit } from "@/lib/rateLimit";
import { alignReadings } from "@/lib/vehicle";
import { afterCodesReport, afterSpeedBatch } from "@/lib/vehicleAlerts";
import {
  bearerToken,
  clampNoteTime,
  EMAILS_PER_HOUR,
  hashDeviceToken,
  isTokenIdleExpired,
  parseOp,
  snapshotWindowStart,
  SNAPSHOT_ANNOUNCEMENTS,
  SNAPSHOT_CONVERSATION_DAYS,
  SNAPSHOT_CONVERSATIONS,
  SNAPSHOT_DIRECTORY,
  SNAPSHOT_MANUALS,
  SNAPSHOT_MAX_JOBS,
  SNAPSHOT_MESSAGES_PER_CONVERSATION,
  type OpResult,
  type VanOp,
} from "@/lib/vanSync";
import type { Role } from "@prisma/client";

/**
 * Database side of the van sync API. Access rules mirror the portal exactly:
 * - jobs: like the employee job pages (src/app/portal/employee/actions.ts) — a
 *   van only sees and changes jobs assigned to the signed-in technician, and
 *   cannot move a cancelled job;
 * - messages: like src/app/portal/messages/actions.ts — staff can message any
 *   active user, and only participants can read or reply to a conversation.
 */

export type VanCaller = {
  deviceId: string;
  deviceName: string;
  user: { id: string; name: string; email: string; role: Role };
};

/**
 * Resolves the device + user from the bearer token. Returns null for a missing,
 * unknown, revoked, or idle-expired token, or a user who is no longer active
 * staff — the van then shows its sign-in screen.
 */
export async function authenticateDevice(
  authHeader: string | null,
): Promise<VanCaller | null> {
  const raw = bearerToken(authHeader);
  if (!raw) return null;

  const device = await prisma.vanDevice.findUnique({
    where: { tokenHash: hashDeviceToken(raw) },
    include: {
      user: { select: { id: true, name: true, email: true, role: true, active: true } },
    },
  });
  if (!device || device.revokedAt) return null;
  if (isTokenIdleExpired(device.lastSeenAt)) return null;
  const { user } = device;
  if (!user.active || (user.role !== "EMPLOYEE" && user.role !== "ADMIN")) return null;

  return {
    deviceId: device.id,
    deviceName: device.name,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}

export async function touchDevice(deviceId: string, ip: string, appVersion?: string) {
  await prisma.vanDevice.update({
    where: { id: deviceId },
    data: {
      lastSeenAt: new Date(),
      lastIp: ip.slice(0, 64),
      ...(appVersion ? { appVersion: appVersion.slice(0, 40) } : {}),
    },
  });
}

// ---------- Applying queued changes from the van ----------

export async function applyOps(caller: VanCaller, rawOps: unknown[]): Promise<OpResult[]> {
  const results: OpResult[] = [];
  // Applied strictly in order: a van that went Start → Complete offline must
  // land on Completed.
  for (const raw of rawOps) {
    const parsed = parseOp(raw);
    if ("result" in parsed) {
      results.push(parsed.result);
      continue;
    }
    results.push(await applyOp(caller, parsed.op));
  }
  return results;
}

async function applyOp(caller: VanCaller, op: VanOp): Promise<OpResult> {
  switch (op.type) {
    case "job.status":
    case "note.add":
      return applyJobOp(caller, op);
    case "msg.send":
    case "msg.start":
    case "msg.read":
      return applyMessageOp(caller, op);
    case "email.send":
      return applyEmailOp(caller, op);
    case "speed.batch":
    case "obd.codes":
      return applyVehicleOp(caller, op);
  }
}

type JobOp = Extract<VanOp, { type: "job.status" | "note.add" }>;
type MessageOp = Extract<VanOp, { type: "msg.send" | "msg.start" | "msg.read" }>;
type EmailOp = Extract<VanOp, { type: "email.send" }>;

async function applyJobOp(caller: VanCaller, op: JobOp): Promise<OpResult> {
  const reject = (error: string): OpResult => ({ opId: op.opId, ok: false, error });

  const job = await prisma.job.findUnique({
    where: { id: op.jobId },
    select: { id: true, technicianId: true, status: true, customerName: true },
  });
  // Same rule as the portal: jobs not assigned to you are invisible.
  if (!job || job.technicianId !== caller.user.id) {
    return reject("This job is no longer assigned to you.");
  }

  if (op.type === "note.add") {
    const existing = await prisma.jobNote.findUnique({
      where: { id: op.id },
      select: { jobId: true, authorId: true },
    });
    if (existing) {
      // Resent after a dropped connection — already saved.
      return existing.jobId === job.id && existing.authorId === caller.user.id
        ? { opId: op.opId, ok: true }
        : reject("Invalid note.");
    }
    // Notes written in the field are kept even if the job was cancelled in the
    // meantime — losing a tech's notes is worse than an extra internal note.
    await prisma.jobNote.create({
      data: {
        id: op.id,
        jobId: job.id,
        authorId: caller.user.id,
        body: op.body,
        createdAt: clampNoteTime(op.createdAt),
      },
    });
    return { opId: op.opId, ok: true };
  }

  // job.status
  if (job.status === "CANCELLED") {
    return reject(`${job.customerName}: the office cancelled this job, so the status change was not saved.`);
  }
  const summary = op.summary?.trim();
  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: op.status,
      ...(op.status === "COMPLETED" && summary ? { summary } : {}),
    },
  });
  return { opId: op.opId, ok: true };
}

// ---------- Messaging ----------

async function participant(conversationId: string, userId: string) {
  return prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
}

async function applyMessageOp(caller: VanCaller, op: MessageOp): Promise<OpResult> {
  const ok: OpResult = { opId: op.opId, ok: true };
  const reject = (error: string): OpResult => ({ opId: op.opId, ok: false, error });
  const me = caller.user;

  if (op.type === "msg.read") {
    if (!(await participant(op.conversationId, me.id))) return ok; // nothing to mark
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: op.conversationId, userId: me.id } },
      data: { lastReadAt: new Date() },
    });
    return ok;
  }

  if (op.type === "msg.start") {
    const existing = await prisma.conversation.findUnique({
      where: { id: op.conversationId },
      select: { id: true },
    });
    if (existing) {
      // Resent after a dropped connection — already created.
      return (await participant(op.conversationId, me.id)) ? ok : reject("Invalid conversation.");
    }
    // Staff may message any active user (same rule as the portal).
    const valid = await prisma.user.findMany({
      where: { id: { in: op.recipientIds }, active: true, NOT: { id: me.id } },
      select: { id: true },
    });
    if (valid.length === 0) {
      return reject("Your new conversation couldn't be sent: those people are no longer available.");
    }
    const now = new Date();
    const ids = Array.from(new Set([me.id, ...valid.map((v) => v.id)]));
    await prisma.conversation.create({
      data: {
        id: op.conversationId,
        subject: op.subject || null,
        participants: {
          create: ids.map((id) => ({ userId: id, lastReadAt: id === me.id ? now : null })),
        },
        messages: { create: { id: op.id, senderId: me.id, body: op.body, createdAt: now } },
      },
    });
    await notifyParticipants(op.conversationId, me.id, me.name, op.body);
    return ok;
  }

  // msg.send
  const existing = await prisma.message.findUnique({
    where: { id: op.id },
    select: { senderId: true, conversationId: true },
  });
  if (existing) {
    return existing.senderId === me.id && existing.conversationId === op.conversationId
      ? ok
      : reject("Invalid message.");
  }
  if (!(await participant(op.conversationId, me.id))) {
    return reject("Your message couldn't be sent: you're no longer in that conversation.");
  }
  // Server time, not the van's: keeps every device's conversation in the same
  // order even if a laptop's clock is off.
  const now = new Date();
  await prisma.message.create({
    data: { id: op.id, conversationId: op.conversationId, senderId: me.id, body: op.body, createdAt: now },
  });
  await prisma.conversation.update({ where: { id: op.conversationId }, data: { updatedAt: now } });
  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId: op.conversationId, userId: me.id } },
    data: { lastReadAt: now },
  });
  await notifyParticipants(op.conversationId, me.id, me.name, op.body);
  return ok;
}

// ---------- Email from the technician's own mailbox ----------

async function applyEmailOp(caller: VanCaller, op: EmailOp): Promise<OpResult> {
  const reject = (error: string): OpResult => ({ opId: op.opId, ok: false, error });
  const retry = (error: string): OpResult => ({ opId: op.opId, ok: false, retry: true, error });
  const me = caller.user;
  const label = `Email "${op.subject.slice(0, 60)}"`;

  const existing = await prisma.emailLog.findUnique({
    where: { id: op.id },
    select: { status: true, senderUserId: true },
  });
  if (existing) {
    if (existing.senderUserId !== me.id) return reject("Invalid email.");
    if (existing.status === "SENT") return { opId: op.opId, ok: true }; // already sent
  }

  const mailbox = await prisma.mailbox.findUnique({ where: { userId: me.id } });
  const password = mailbox ? decryptSecret(mailbox.passwordEncrypted) : null;
  if (!mailbox || !password) {
    return reject(`${label} was not sent: connect your email account in the Email tab, then send it again.`);
  }
  if (!rateLimit(`van-email:${me.id}`, EMAILS_PER_HOUR, 60 * 60 * 1000).ok) {
    return retry(`${label} is waiting: hourly email limit reached.`);
  }

  const text = `${op.body}\n\n${me.name}${COMPANY_SIGNATURE}`;
  const log = {
    senderUserId: me.id,
    fromAddress: mailbox.address,
    to: op.to.join(", "),
    subject: op.subject,
    body: text,
    direction: "OUTBOUND",
  };
  await prisma.emailLog.upsert({
    where: { id: op.id },
    create: { id: op.id, ...log, status: "LOGGED" },
    update: { status: "LOGGED" },
  });

  try {
    await sendFromMailbox(
      { address: mailbox.address, password },
      {
        fromName: me.name,
        to: op.to,
        subject: op.subject,
        text,
        // Stable Message-ID: if a retry ever re-sends, mail clients collapse it.
        messageId: `<${op.id}@${mailbox.address.split("@")[1]}>`,
      },
    );
  } catch (err) {
    const failure = describeMailError(err);
    await prisma.emailLog.update({ where: { id: op.id }, data: { status: "FAILED" } });
    console.error("[van email]", (err as Error).message);
    return failure.retry ? retry(`${label}: ${failure.message}`) : reject(`${label} was not sent. ${failure.message}`);
  }
  await prisma.emailLog.update({ where: { id: op.id }, data: { status: "SENT" } });
  return { opId: op.opId, ok: true };
}

// ---------- Vehicle data (OBD-II) ----------

type VehicleOp = Extract<VanOp, { type: "speed.batch" | "obd.codes" }>;

async function applyVehicleOp(caller: VanCaller, op: VehicleOp): Promise<OpResult> {
  const ok: OpResult = { opId: op.opId, ok: true };
  const van = { deviceId: caller.deviceId, vanName: caller.deviceName, driverName: caller.user.name };

  if (op.type === "speed.batch") {
    const readings = alignReadings(op.readings, op.deviceNow);
    if (readings.length) {
      // skipDuplicates: a batch resent after a lost reply is ignored.
      await prisma.vehicleSpeed.createMany({
        data: readings.map((r) => ({ ...van, driverId: caller.user.id, recordedAt: r.recordedAt, mph: r.mph })),
        skipDuplicates: true,
      });
      await afterSpeedBatch(van, readings);
    }
    return ok;
  }

  // obd.codes
  if (await prisma.vehicleCodeReport.findUnique({ where: { id: op.id }, select: { id: true } })) {
    return ok; // resent
  }
  const [aligned] = alignReadings([{ t: op.at, mph: 0 }], op.at);
  const report = await prisma.vehicleCodeReport.create({
    data: {
      id: op.id,
      ...van,
      recordedAt: aligned?.recordedAt ?? new Date(),
      milOn: op.milOn,
      storedCodes: op.stored.join(","),
      pendingCodes: op.pending.join(","),
    },
  });
  await afterCodesReport(report);
  return ok;
}

// ---------- Snapshot of the technician's working set ----------

export async function buildSnapshot(caller: VanCaller) {
  const jobs = await prisma.job.findMany({
    where: {
      technicianId: caller.user.id,
      OR: [
        { status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
        { scheduledDate: { gte: snapshotWindowStart() } },
      ],
    },
    orderBy: [{ scheduledDate: "asc" }, { createdAt: "asc" }],
    take: SNAPSHOT_MAX_JOBS,
    include: {
      client: { select: { name: true, phone: true, email: true } },
      notes: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true } } },
      },
    },
  });

  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    take: SNAPSHOT_ANNOUNCEMENTS,
    include: { author: { select: { name: true } } },
  });

  const conversations = await prisma.conversation.findMany({
    where: {
      participants: { some: { userId: caller.user.id } },
      updatedAt: { gte: new Date(Date.now() - SNAPSHOT_CONVERSATION_DAYS * 86_400_000) },
    },
    orderBy: { updatedAt: "desc" },
    take: SNAPSHOT_CONVERSATIONS,
    include: {
      participants: { include: { user: { select: { id: true, name: true } } } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: SNAPSHOT_MESSAGES_PER_CONVERSATION,
        include: { sender: { select: { name: true } } },
      },
    },
  });

  // People this tech can start a conversation with (staff may message anyone).
  const directory = await prisma.user.findMany({
    where: { active: true, NOT: { id: caller.user.id } },
    orderBy: [{ role: "desc" }, { name: "asc" }],
    take: SNAPSHOT_DIRECTORY,
    select: { id: true, name: true, role: true },
  });

  // The whole manuals library (metadata only; vans download the files
  // separately, on demand or all at once on shop Wi-Fi).
  const manuals = await prisma.manual.findMany({
    orderBy: [{ brand: "asc" }, { model: "asc" }, { createdAt: "asc" }],
    take: SNAPSHOT_MANUALS,
    select: {
      id: true, brand: true, model: true, equipmentType: true, title: true,
      originalName: true, size: true, sha256: true,
    },
  });

  const mailbox = await prisma.mailbox.findUnique({
    where: { userId: caller.user.id },
    select: { address: true },
  });

  return {
    user: caller.user,
    mailbox: mailbox ? { address: mailbox.address } : null,
    manuals,
    directory,
    conversations: conversations.map((c) => {
      const mine = c.participants.find((p) => p.userId === caller.user.id);
      return {
        id: c.id,
        subject: c.subject,
        updatedAt: c.updatedAt.toISOString(),
        lastReadAt: mine?.lastReadAt?.toISOString() ?? null,
        participants: c.participants
          .filter((p) => p.userId !== caller.user.id)
          .map((p) => p.user.name),
        messages: c.messages.reverse().map((m) => ({
          id: m.id,
          body: m.body,
          senderName: m.sender?.name ?? (m.viaEmail ? "Email" : "Former user"),
          mine: m.senderId === caller.user.id,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    }),
    jobs: jobs.map((j) => ({
      id: j.id,
      customerName: j.customerName,
      address: j.address,
      serviceNeeded: j.serviceNeeded,
      // Dates are entered in the portal as a calendar day stored at UTC
      // midnight, so the UTC date part IS the appointment day.
      scheduledDay: j.scheduledDate.toISOString().slice(0, 10),
      scheduledTime: j.scheduledTime,
      status: j.status,
      cancelReason: j.cancelReason,
      summary: j.summary,
      clientName: j.client?.name ?? null,
      clientPhone: j.client?.phone ?? null,
      clientEmail: j.client?.email ?? null,
      notes: j.notes.map((n) => ({
        id: n.id,
        body: n.body,
        authorName: n.author.name,
        createdAt: n.createdAt.toISOString(),
      })),
    })),
    announcements: announcements.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      authorName: a.author.name,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}
