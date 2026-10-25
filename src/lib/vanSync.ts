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
 * connection: notes, messages and emails carry a device-generated id, and
 * status changes / read markers just set a value. The snapshot is the full working set for the technician, so jobs that
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

// Device-generated ids (notes, messages, conversations, emails) look like
// "van_" + 32 hex chars (a uuid4 without dashes), so they can never collide
// with Prisma cuids.
export const VAN_ID = /^van_[0-9a-f]{32}$/;

export const MAX_MESSAGE_RECIPIENTS = 20;
export const MAX_EMAIL_RECIPIENTS = 25; // same cap as the portal's Compose Email
export const EMAILS_PER_HOUR = 60;

// Conversations sent to a van: the most recently active ones, each with its
// latest messages.
export const SNAPSHOT_CONVERSATIONS = 40;
export const SNAPSHOT_CONVERSATION_DAYS = 90;
export const SNAPSHOT_MESSAGES_PER_CONVERSATION = 50;
export const SNAPSHOT_DIRECTORY = 500;
export const SNAPSHOT_MANUALS = 5000;
export const MAX_SPEED_READINGS = 1000;

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
  id: z.string().regex(VAN_ID),
  jobId: z.string().min(1).max(64),
  body: z.string().trim().min(1).max(10_000),
  createdAt: isoDate,
});

const vanId = z.string().regex(VAN_ID);

// Reply in an existing conversation.
const messageOp = z.object({
  opId: z.string().min(1).max(64),
  type: z.literal("msg.send"),
  id: vanId,
  conversationId: z.string().min(1).max(64),
  body: z.string().trim().min(1).max(10_000),
});

// Start a new conversation (the van picks both ids so it can show the thread
// straight away, before it reaches the server).
const startOp = z.object({
  opId: z.string().min(1).max(64),
  type: z.literal("msg.start"),
  conversationId: vanId,
  id: vanId,
  recipientIds: z.array(z.string().min(1).max(64)).min(1).max(MAX_MESSAGE_RECIPIENTS),
  subject: z.string().trim().max(255).optional(),
  body: z.string().trim().min(1).max(10_000),
});

const readOp = z.object({
  opId: z.string().min(1).max(64),
  type: z.literal("msg.read"),
  conversationId: z.string().min(1).max(64),
});

// Email sent from the technician's own mailbox (see src/lib/mailbox.ts).
const emailOp = z.object({
  opId: z.string().min(1).max(64),
  type: z.literal("email.send"),
  id: vanId,
  to: z.array(z.string().trim().email().max(254)).min(1).max(MAX_EMAIL_RECIPIENTS),
  subject: z.string().trim().min(1).max(255),
  body: z.string().trim().min(1).max(20_000),
});

// Vehicle speed readings from the OBD-II adapter (not stored in the van's
// outbox; one batch per sync). opId is derived from the last reading's time.
const speedOp = z.object({
  opId: z.string().min(1).max(64),
  type: z.literal("speed.batch"),
  deviceNow: isoDate,
  readings: z
    .array(z.object({ t: isoDate, mph: z.number().min(0).max(250) }))
    .max(MAX_SPEED_READINGS),
});

// Trouble codes, sent when they change.
const dtcCode = z.string().regex(/^[PCBU][0-3][0-9A-F]{3}$/);
const codesOp = z.object({
  opId: z.string().min(1).max(64),
  type: z.literal("obd.codes"),
  id: vanId,
  at: isoDate,
  milOn: z.boolean(),
  stored: z.array(dtcCode).max(50),
  pending: z.array(dtcCode).max(50),
});

export const opSchema = z.discriminatedUnion("type", [
  statusOp,
  noteOp,
  messageOp,
  startOp,
  readOp,
  emailOp,
  speedOp,
  codesOp,
]);
export type VanOp = z.infer<typeof opSchema>;

export const syncSchema = z.object({
  protocol: z.number().int().optional(),
  appVersion: z.string().max(40).optional(),
  snapshotHash: z.string().max(64).optional(),
  // Ops are validated one by one so a single malformed op is rejected on its
  // own instead of blocking the whole outbox behind it.
  // +1: the speed batch rides along with a full batch of outbox ops.
  ops: z.array(z.unknown()).max(MAX_OPS_PER_SYNC + 1).default([]),
});

export type OpResult = {
  opId: string;
  ok: boolean;
  // A rejected op will never succeed (job cancelled, reassigned, invalid), so
  // the device should drop it from its outbox and tell the technician.
  error?: string;
  // Temporary failure (e.g. mail server unreachable): keep the op queued and
  // send it again on a later sync.
  retry?: boolean;
};

export const mailboxSchema = z.union([
  z.object({ disconnect: z.literal(true) }),
  z.object({
    address: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(500),
  }),
]);

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
