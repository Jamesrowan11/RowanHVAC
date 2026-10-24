import crypto from "crypto";
import { z } from "zod";

/**
 * Van terminal sync protocol (shared, pure helpers — no Prisma here so it is
 * easy to unit test). The van app (see `van-app/`) is offline-first: it keeps a
 * local copy of the technician's jobs and queues changes in an outbox. Each sync
 * is ONE round trip to `POST /api/van/v1/sync`:
 *
 *   request  { appVersion, snapshotHash?, ops: Op[] }
 *   response { serverTime, results: OpResult[], snapshotHash,
 *              unchanged: true } | { ..., unchanged: false, snapshot }
 *
 * Ops are idempotent so a device can safely resend them after a dropped
 * connection: notes carry a device-generated id, and status changes just set a
 * value. The snapshot is the full working set for the technician, so jobs that
 * were reassigned or deleted simply disappear from the device — no tombstones,
 * and no reliance on the van's clock being right.
 */

export const VAN_PROTOCOL_VERSION = 1;

// A token that has not synced for this long stops working (lost laptop safety
// net). Admins can also revoke a device immediately from the portal.
export const VAN_TOKEN_IDLE_DAYS = 30;

// The working set sent to a van: every open job, plus anything scheduled in the
// recent past (so a tech can look back at last week's visits).
export const SNAPSHOT_PAST_DAYS = 14;
export const SNAPSHOT_MAX_JOBS = 300;
export const SNAPSHOT_ANNOUNCEMENTS = 20;

export const MAX_OPS_PER_SYNC = 200;

// Device-generated note ids look like "van_" + 32 hex chars (a uuid4 without
// dashes), so they can never collide with Prisma cuids.
export const VAN_NOTE_ID = /^van_[0-9a-f]{32}$/;

export function generateDeviceToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  return { raw, hash: hashDeviceToken(raw) };
}

export function hashDeviceToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/** Pulls the token out of an `Authorization: Bearer …` header. */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+([0-9a-f]{64})$/i.exec(header.trim());
  return m ? m[1].toLowerCase() : null;
}

export function isTokenIdleExpired(lastSeenAt: Date, now = new Date()): boolean {
  return now.getTime() - lastSeenAt.getTime() > VAN_TOKEN_IDLE_DAYS * 86_400_000;
}

// ---------- Request schemas ----------

export const loginSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(1).max(200),
  deviceName: z.string().trim().min(1).max(120),
  appVersion: z.string().max(40).optional(),
});

const isoDate = z
  .string()
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");

const statusOp = z.object({
  opId: z.string().min(1).max(64),
  type: z.literal("job.status"),
  jobId: z.string().min(1).max(64),
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED"]),
  summary: z.string().max(2000).optional(),
});

const noteOp = z.object({
  opId: z.string().min(1).max(64),
  type: z.literal("note.add"),
  id: z.string().regex(VAN_NOTE_ID),
  jobId: z.string().min(1).max(64),
  body: z.string().trim().min(1).max(10_000),
  createdAt: isoDate,
});

export const opSchema = z.discriminatedUnion("type", [statusOp, noteOp]);
export type VanOp = z.infer<typeof opSchema>;

export const syncSchema = z.object({
  protocol: z.number().int().optional(),
  appVersion: z.string().max(40).optional(),
  snapshotHash: z.string().max(64).optional(),
  // Ops are validated one by one so a single malformed op is rejected on its
  // own instead of blocking the whole outbox behind it.
  ops: z.array(z.unknown()).max(MAX_OPS_PER_SYNC).default([]),
});

export type OpResult = {
  opId: string;
  ok: boolean;
  // A rejected op will never succeed (job cancelled, reassigned, invalid), so
  // the device should drop it from its outbox and tell the technician.
  error?: string;
};

/** Parses one raw op; returns either the op or a permanent rejection. */
export function parseOp(raw: unknown): { op: VanOp } | { result: OpResult } {
  const parsed = opSchema.safeParse(raw);
  if (parsed.success) return { op: parsed.data };
  const opId =
    raw && typeof raw === "object" && typeof (raw as { opId?: unknown }).opId === "string"
      ? String((raw as { opId: string }).opId).slice(0, 64)
      : "unknown";
  return { result: { opId, ok: false, error: "Invalid change; it was discarded." } };
}

/**
 * The van's clock may be wrong (dead CMOS battery on an old laptop). Keep the
 * note's written-at time when plausible, but never in the future and never
 * absurdly old.
 */
export function clampNoteTime(createdAt: string, now = new Date()): Date {
  const t = new Date(createdAt);
  const max = now.getTime() + 5 * 60_000;
  const min = now.getTime() - 90 * 86_400_000;
  if (Number.isNaN(t.getTime()) || t.getTime() > max || t.getTime() < min) {
    return now;
  }
  return t;
}

export function snapshotWindowStart(now = new Date()): Date {
  return new Date(now.getTime() - SNAPSHOT_PAST_DAYS * 86_400_000);
}

/** Stable hash of a snapshot so unchanged syncs can skip the payload. */
export function hashSnapshot(snapshot: unknown): string {
  return crypto.createHash("sha256").update(stableStringify(snapshot)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}
