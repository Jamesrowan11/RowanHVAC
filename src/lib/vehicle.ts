/**
 * Vehicle data from the vans' OBD-II adapters: speed readings and trouble
 * codes. Pure helpers (no Prisma) so they're easy to test.
 */

// Day boundaries and times on the admin page use the company's time zone,
// not the server's (Plesk servers usually run in UTC).
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "America/New_York";

/** Email the admins when a van goes faster than this (0 turns alerts off). */
export function speedAlertMph(): number {
  const v = Number(process.env.SPEED_ALERT_MPH ?? 80);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export const SPEED_RETENTION_DAYS = Number(process.env.SPEED_RETENTION_DAYS || 365);

// ---------- Time zones (no date library needed) ----------

/** Offset of `tz` from UTC at instant `at`, in ms (e.g. -4h for EDT). */
export function tzOffsetMs(at: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant of local wall-clock time `y-m-d h:min` in `tz`. */
export function zonedTime(day: string, hhmm: string, tz: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h || 0, min || 0);
  // Two passes handle the DST switch correctly.
  let t = guess - tzOffsetMs(new Date(guess), tz);
  t = guess - tzOffsetMs(new Date(t), tz);
  return new Date(t);
}

/** [start, end) of a local calendar day in `tz`. */
export function dayRange(day: string, tz: string): { start: Date; end: Date } {
  const [y, m, d] = day.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { start: zonedTime(day, "00:00", tz), end: zonedTime(next, "00:00", tz) };
}

export function todayIn(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function fmtTime(at: Date, tz: string, seconds = false): string {
  return at.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
  });
}

export function isDay(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

// ---------- Readings ----------

export type Reading = { recordedAt: Date; mph: number };

/**
 * Laptop clocks drift (and an old Toughbook's CMOS battery may be dead), so
 * readings are re-timed using how far the van's clock was off when it sent
 * them. Readings in the future or older than 30 days are dropped.
 */
export function alignReadings(
  readings: { t: string; mph: number }[],
  deviceNow: string,
  now = new Date(),
): Reading[] {
  const skew = now.getTime() - new Date(deviceNow).getTime();
  const shift = Math.abs(skew) > 2 * 60_000 ? skew : 0;
  const max = now.getTime() + 60_000;
  const min = now.getTime() - 30 * 86_400_000;
  const out: Reading[] = [];
  for (const r of readings) {
    const t = new Date(r.t).getTime() + shift;
    if (Number.isNaN(t) || t > max || t < min) continue;
    out.push({ recordedAt: new Date(t), mph: Math.max(0, Math.min(200, Math.round(r.mph))) });
  }
  return out;
}

// A gap longer than this between readings means the van was off / no adapter.
export const GAP_MS = 2 * 60_000;

const DIP_MS = 60_000;

export type SpeedEvent = { start: Date; end: Date; maxMph: number };

export function summarizeSpeeds(readings: Reading[], limitMph: number) {
  let max: Reading | null = null;
  let movingMs = 0;
  const events: SpeedEvent[] = [];
  let current: SpeedEvent | null = null;

  readings.forEach((r, i) => {
    if (!max || r.mph > max.mph) max = r;
    const next = readings[i + 1];
    if (next && r.mph > 0) {
      const dt = next.recordedAt.getTime() - r.recordedAt.getTime();
      if (dt > 0 && dt <= GAP_MS) movingMs += dt;
    }
    // One stretch of speeding survives a brief dip under the limit (<= 1 min).
    if (r.mph > limitMph) {
      if (current && r.recordedAt.getTime() - current.end.getTime() <= DIP_MS) {
        current.end = r.recordedAt;
        current.maxMph = Math.max(current.maxMph, r.mph);
      } else {
        current = { start: r.recordedAt, end: r.recordedAt, maxMph: r.mph };
        events.push(current);
      }
    }
  });

  return {
    count: readings.length,
    max: max as Reading | null,
    movingMinutes: Math.round(movingMs / 60_000),
    first: readings[0]?.recordedAt ?? null,
    last: readings[readings.length - 1]?.recordedAt ?? null,
    events,
  };
}

/** The reading closest to `at`, if one is within 5 minutes. */
export function readingNear<T extends Reading>(readings: T[], at: Date): T | null {
  let best: T | null = null;
  for (const r of readings) {
    if (!best || Math.abs(r.recordedAt.getTime() - at.getTime()) < Math.abs(best.recordedAt.getTime() - at.getTime())) {
      best = r;
    }
  }
  return best && Math.abs(best.recordedAt.getTime() - at.getTime()) <= 5 * 60_000 ? best : null;
}

// ---------- Trouble codes ----------

export const DTC = /^[PCBU][0-3][0-9A-F]{3}$/;

// Generic (SAE J2012) meanings of common codes. Manufacturer-specific codes
// (P1xxx, etc.) vary by make; the page links out for those.
const DTC_DESCRIPTIONS: Record<string, string> = {
  P0100: "Mass air flow (MAF) circuit malfunction",
  P0101: "Mass air flow (MAF) sensor range/performance",
  P0102: "Mass air flow (MAF) circuit low input",
  P0103: "Mass air flow (MAF) circuit high input",
  P0110: "Intake air temperature circuit malfunction",
  P0115: "Engine coolant temperature circuit malfunction",
  P0117: "Engine coolant temperature circuit low input",
  P0118: "Engine coolant temperature circuit high input",
  P0120: "Throttle position sensor circuit malfunction",
  P0125: "Insufficient coolant temperature for closed-loop fuel control",
  P0128: "Coolant thermostat below regulating temperature",
  P0130: "O2 sensor circuit malfunction (bank 1, sensor 1)",
  P0131: "O2 sensor circuit low voltage (bank 1, sensor 1)",
  P0133: "O2 sensor circuit slow response (bank 1, sensor 1)",
  P0135: "O2 sensor heater circuit malfunction (bank 1, sensor 1)",
  P0141: "O2 sensor heater circuit malfunction (bank 1, sensor 2)",
  P0171: "System too lean (bank 1)",
  P0172: "System too rich (bank 1)",
  P0174: "System too lean (bank 2)",
  P0175: "System too rich (bank 2)",
  P0300: "Random/multiple cylinder misfire detected",
  P0301: "Cylinder 1 misfire detected",
  P0302: "Cylinder 2 misfire detected",
  P0303: "Cylinder 3 misfire detected",
  P0304: "Cylinder 4 misfire detected",
  P0305: "Cylinder 5 misfire detected",
  P0306: "Cylinder 6 misfire detected",
  P0307: "Cylinder 7 misfire detected",
  P0308: "Cylinder 8 misfire detected",
  P0325: "Knock sensor 1 circuit malfunction",
  P0335: "Crankshaft position sensor circuit malfunction",
  P0340: "Camshaft position sensor circuit malfunction",
  P0401: "Exhaust gas recirculation (EGR) flow insufficient",
  P0402: "Exhaust gas recirculation (EGR) flow excessive",
  P0420: "Catalyst system efficiency below threshold (bank 1)",
  P0430: "Catalyst system efficiency below threshold (bank 2)",
  P0440: "Evaporative emission (EVAP) system malfunction",
  P0441: "EVAP system incorrect purge flow",
  P0442: "EVAP system leak detected (small leak)",
  P0446: "EVAP system vent control circuit malfunction",
  P0455: "EVAP system leak detected (large leak)",
  P0456: "EVAP system leak detected (very small leak)",
  P0500: "Vehicle speed sensor malfunction",
  P0505: "Idle control system malfunction",
  P0506: "Idle control system RPM lower than expected",
  P0507: "Idle control system RPM higher than expected",
  P0562: "System voltage low",
  P0563: "System voltage high",
  P0700: "Transmission control system malfunction",
};

export function dtcDescription(code: string): string | null {
  return DTC_DESCRIPTIONS[code] ?? null;
}

export function splitCodes(s: string): string[] {
  return s ? s.split(",").filter(Boolean) : [];
}
