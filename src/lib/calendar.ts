/**
 * Date helpers for the custom two-week calendar (no third-party library).
 *
 * All grid math is done on calendar-date *keys* (YYYY-MM-DD) anchored to UTC
 * midnight, so weekday columns always line up regardless of the server's
 * timezone. Job timestamps are mapped to their Eastern calendar date for
 * bucketing, so the business sees its own day.
 */

const TZ = "America/New_York";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export { WEEKDAYS };

/** Eastern calendar date (YYYY-MM-DD) for an instant — used to bucket jobs. */
export function easternKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function todayKey(): string {
  return easternKey(new Date());
}

/** A UTC-anchored Date for a YYYY-MM-DD key, so getUTC* equals the calendar parts. */
function keyToDate(key: string): Date {
  return new Date(key + "T00:00:00.000Z");
}

function dateToKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Shift a date key by N days (DST-safe, since it stays at UTC midnight). */
export function shiftKey(key: string, days: number): string {
  return dateToKey(new Date(keyToDate(key).getTime() + days * 86_400_000));
}

/** The Sunday on or before the given key. */
export function startOfWeekKey(key: string): string {
  const weekday = keyToDate(key).getUTCDay(); // 0 = Sunday
  return shiftKey(key, -weekday);
}

export type GridDay = {
  key: string;
  weekday: number; // 0-6, matches column
  dayNum: number;
  monthShort: string;
  isToday: boolean;
};

/** 14 day cells starting at startKey (which must be a Sunday). */
export function twoWeekGrid(startKey: string): GridDay[] {
  const today = todayKey();
  return Array.from({ length: 14 }, (_, i) => {
    const key = shiftKey(startKey, i);
    const d = keyToDate(key);
    return {
      key,
      weekday: d.getUTCDay(),
      dayNum: d.getUTCDate(),
      monthShort: MONTHS[d.getUTCMonth()],
      isToday: key === today,
    };
  });
}

export function rangeLabel(startKey: string): string {
  const a = keyToDate(startKey);
  const b = keyToDate(shiftKey(startKey, 13));
  return `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()} – ${MONTHS[b.getUTCMonth()]} ${b.getUTCDate()}, ${b.getUTCFullYear()}`;
}

/** Validate a ?start=YYYY-MM-DD param; fall back to today. */
export function safeKey(input: string | undefined): string {
  return input && /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : todayKey();
}

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
}
