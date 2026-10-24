import { prisma } from "@/lib/prisma";
import {
  bearerToken,
  clampNoteTime,
  hashDeviceToken,
  isTokenIdleExpired,
  parseOp,
  snapshotWindowStart,
  SNAPSHOT_ANNOUNCEMENTS,
  SNAPSHOT_MAX_JOBS,
  type OpResult,
  type VanOp,
} from "@/lib/vanSync";
import type { Role } from "@prisma/client";

/**
 * Database side of the van sync API. Access rules mirror the portal's employee
 * job pages exactly (see src/app/portal/employee/actions.ts): a van only ever
 * sees and changes jobs assigned to the signed-in technician, and cannot move a
 * cancelled job.
 */

export type VanCaller = {
  deviceId: string;
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

  return {
    user: caller.user,
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
