/** Date helpers for the custom two-week calendar (no third-party library). */

const TZ = "America/New_York";

/** Local (Eastern) midnight for the Sunday on/before the given date. */
export function startOfWeek(d: Date): Date {
  // Work in Eastern time so the grid lines up with the business's day.
  const eastern = new Date(d.toLocaleString("en-US", { timeZone: TZ }));
  eastern.setHours(0, 0, 0, 0);
  eastern.setDate(eastern.getDate() - eastern.getDay()); // back up to Sunday
  return eastern;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Build an array of 14 day-buckets starting at `start`. */
export function twoWeekGrid(start: Date): { date: Date; key: string }[] {
  return Array.from({ length: 14 }, (_, i) => {
    const date = addDays(start, i);
    return { date, key: dayKey(date) };
  });
}

/** YYYY-MM-DD in Eastern time, used to bucket jobs into days. */
export function dayKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function fmtDayHeader(d: Date): { weekday: string; day: string; month: string } {
  return {
    weekday: d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" }),
    day: d.toLocaleDateString("en-US", { timeZone: TZ, day: "numeric" }),
    month: d.toLocaleDateString("en-US", { timeZone: TZ, month: "short" }),
  };
}

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
}

export function isToday(d: Date): boolean {
  return dayKey(d) === dayKey(new Date());
}
