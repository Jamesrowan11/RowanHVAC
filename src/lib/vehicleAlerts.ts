import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { appBaseUrl } from "@/lib/passwordReset";
import {
  APP_TIMEZONE,
  dtcDescription,
  fmtTime,
  SPEED_RETENTION_DAYS,
  speedAlertMph,
  splitCodes,
  type Reading,
} from "@/lib/vehicle";
import type { VehicleCodeReport } from "@prisma/client";

/**
 * Emails to the admins about the vans: speeding (above SPEED_ALERT_MPH) and
 * new OBD-II trouble codes. Every email is also in the portal's email log.
 */

async function adminEmails(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { email: true },
  });
  return admins.map((a) => a.email);
}

function vehiclesLink(vanName: string, day?: string) {
  const p = new URLSearchParams({ van: vanName, ...(day ? { date: day } : {}) });
  return `${appBaseUrl()}/portal/admin/vehicles?${p}`;
}

// At most one speeding email per van per hour (in-memory; fine for a single
// portal process).
const lastSpeedAlert = new Map<string, number>();
let lastPrune = 0;

export async function afterSpeedBatch(
  van: { vanName: string; driverName: string },
  readings: Reading[],
) {
  // Housekeeping: drop old readings, at most once an hour.
  if (Date.now() - lastPrune > 60 * 60_000) {
    lastPrune = Date.now();
    await prisma.vehicleSpeed.deleteMany({
      where: { recordedAt: { lt: new Date(Date.now() - SPEED_RETENTION_DAYS * 86_400_000) } },
    });
  }

  const limit = speedAlertMph();
  if (!limit) return;
  const fast = readings.filter((r) => r.mph > limit);
  if (fast.length === 0) return;
  const last = lastSpeedAlert.get(van.vanName) ?? 0;
  if (Date.now() - last < 60 * 60_000) return;
  lastSpeedAlert.set(van.vanName, Date.now());

  const top = fast.reduce((a, b) => (b.mph > a.mph ? b : a));
  const to = await adminEmails();
  if (to.length === 0) return;
  await sendEmail({
    to,
    subject: `Speed alert: ${van.vanName} at ${top.mph} mph`,
    body:
      `${van.vanName} (driver: ${van.driverName}) went over ${limit} mph.\n\n` +
      `Top speed: ${top.mph} mph at ${fmtTime(top.recordedAt, APP_TIMEZONE)}.\n` +
      `Readings over ${limit} mph in this upload: ${fast.length}.\n\n` +
      `See the full day: ${vehiclesLink(van.vanName)}\n\n` +
      `(You'll get at most one speed alert per van per hour.)`,
    appendSignature: false,
  });
}

/** Emails the admins when a van reports a code it hasn't reported before. */
export async function afterCodesReport(report: VehicleCodeReport) {
  const previous = await prisma.vehicleCodeReport.findFirst({
    where: { vanName: report.vanName, id: { not: report.id }, recordedAt: { lte: report.recordedAt } },
    orderBy: { recordedAt: "desc" },
  });
  const before = new Set([
    ...splitCodes(previous?.storedCodes ?? ""),
    ...splitCodes(previous?.pendingCodes ?? ""),
  ]);
  const stored = splitCodes(report.storedCodes);
  const pending = splitCodes(report.pendingCodes);
  const fresh = [...stored, ...pending].filter((c) => !before.has(c));
  const milTurnedOn = report.milOn && !previous?.milOn;
  if (fresh.length === 0 && !milTurnedOn) return;

  const describe = (c: string) => `  ${c}  ${dtcDescription(c) ?? "(manufacturer-specific; look it up for this make)"}`;
  const to = await adminEmails();
  if (to.length === 0) return;
  await sendEmail({
    to,
    subject: `${report.vanName}: ${report.milOn ? "check engine light ON" : "new trouble code"}${fresh.length ? ` (${fresh.join(", ")})` : ""}`,
    body:
      `${report.vanName} (driver: ${report.driverName}) reported OBD-II trouble codes ` +
      `at ${fmtTime(report.recordedAt, APP_TIMEZONE)}.\n\n` +
      `Check engine light: ${report.milOn ? "ON" : "off"}\n\n` +
      (stored.length ? `Stored codes:\n${stored.map(describe).join("\n")}\n\n` : "No stored codes.\n\n") +
      (pending.length ? `Pending codes (not confirmed yet):\n${pending.map(describe).join("\n")}\n\n` : "") +
      `Details: ${vehiclesLink(report.vanName)}`,
    appendSignature: false,
  });
}
