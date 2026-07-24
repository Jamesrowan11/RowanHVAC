"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actionRole } from "@/lib/guards";

export type CalendarImportState = {
  ok: boolean;
  error?: string;
  imported?: number;
  duplicates?: number;
  cancelled?: number;
  recurring?: number;
  samples?: string[];
};

/** Unfold ICS continuation lines and normalize newlines. */
const unfold = (text: string) => text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");

const unescapeText = (s: string) =>
  s.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");

/** Get one property ("SUMMARY", "DTSTART", …) from a VEVENT block. */
function prop(block: string, name: string): { params: string; value: string } | null {
  const m = block.match(new RegExp(`^${name}((?:;[^:\\n]*)?):(.*)$`, "m"));
  return m ? { params: m[1] ?? "", value: (m[2] ?? "").trim() } : null;
}

/** Parse an ICS date value. Date-only = all-day. Local times are treated as
 * company-local (the server runs in Eastern time, same as the calendar). */
function parseIcsDate(value: string): { date: Date; allDay: boolean } | null {
  let m = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return { date: new Date(`${m[1]}-${m[2]}-${m[3]}T08:00:00`), allDay: true };
  m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] === "Z" ? "Z" : ""}`;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : { date: d, allDay: false };
  }
  return null;
}

/**
 * Import past (and future) events from a Google Calendar .ics export as
 * jobs, so the whole schedule history lives in the portal calendar.
 * Event title → customer name, location → address, description → summary.
 * Past events arrive as COMPLETED, future ones as SCHEDULED. Duplicates
 * (same title + same start) are skipped, so re-running the import is safe.
 */
export async function importCalendar(_prev: CalendarImportState, formData: FormData): Promise<CalendarImportState> {
  await actionRole("ADMIN");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an .ics file" };
  if (file.size > 20 * 1024 * 1024) return { ok: false, error: "File too large (20 MB max)" };

  const text = unfold(await file.text());
  const blocks = text.split("BEGIN:VEVENT").slice(1).map((b) => b.split("END:VEVENT")[0]);
  if (blocks.length === 0) return { ok: false, error: "No events found — is this a calendar .ics export?" };
  if (blocks.length > 20000) return { ok: false, error: "That's over 20,000 events — split the export up" };

  const now = new Date();
  let duplicates = 0;
  let cancelled = 0;
  let recurring = 0;
  const samples: string[] = [];

  type NewJob = {
    customerName: string;
    address: string;
    service: string;
    scheduledAt: Date;
    endAt: Date | null;
    window: string | null;
    status: "COMPLETED" | "SCHEDULED";
    completedAt: Date | null;
    summary: string | null;
  };
  const toCreate: NewJob[] = [];
  const seenInFile = new Set<string>();

  for (const block of blocks) {
    if (prop(block, "STATUS")?.value === "CANCELLED") { cancelled++; continue; }
    if (prop(block, "RRULE")) recurring++; // imported once, not expanded

    const title = unescapeText(prop(block, "SUMMARY")?.value ?? "").trim().slice(0, 120);
    const startRaw = prop(block, "DTSTART");
    if (!title || !startRaw) continue;
    const start = parseIcsDate(startRaw.value.replace(/^.*:/, "") || startRaw.value);
    if (!start) continue;

    const endRaw = prop(block, "DTEND");
    const end = endRaw ? parseIcsDate(endRaw.value) : null;
    const location = unescapeText(prop(block, "LOCATION")?.value ?? "").trim().slice(0, 300);
    const description = unescapeText(prop(block, "DESCRIPTION")?.value ?? "").trim().slice(0, 5000);

    const key = `${title.toLowerCase()}|${start.date.getTime()}`;
    if (seenInFile.has(key)) { duplicates++; continue; }
    seenInFile.add(key);

    const isPast = (end?.date ?? start.date) < now;
    toCreate.push({
      customerName: title,
      address: location,
      service: "Imported from Google Calendar",
      scheduledAt: start.date,
      // All-day events span as windows; DTEND on all-day events is the NEXT
      // day (exclusive) so we drop it rather than show a bogus span.
      endAt: start.allDay ? null : end?.date ?? null,
      window: start.allDay ? "AM/PM" : null,
      status: isPast ? "COMPLETED" : "SCHEDULED",
      completedAt: isPast ? (end?.date ?? start.date) : null,
      summary: description || null,
    });
    if (samples.length < 8) samples.push(`${title} — ${start.date.toLocaleDateString("en-US")}`);
  }

  // Skip events already imported (same title + start), so re-runs are safe.
  const existing = await db.job.findMany({
    where: { service: "Imported from Google Calendar" },
    select: { customerName: true, scheduledAt: true },
  });
  const existingKeys = new Set(existing.map((j) => `${j.customerName.toLowerCase()}|${j.scheduledAt.getTime()}`));
  const fresh = toCreate.filter((j) => {
    const dup = existingKeys.has(`${j.customerName.toLowerCase()}|${j.scheduledAt.getTime()}`);
    if (dup) duplicates++;
    return !dup;
  });

  for (let i = 0; i < fresh.length; i += 250) {
    await db.job.createMany({ data: fresh.slice(i, i + 250) });
  }

  revalidatePath("/portal", "layout");
  return { ok: true, imported: fresh.length, duplicates, cancelled, recurring, samples };
}
