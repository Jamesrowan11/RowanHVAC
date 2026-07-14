import Link from "next/link";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtWhen } from "@/lib/queries";
import { duplicateJob } from "@/lib/actions/jobs";
import { JobStatusBadge } from "@/components/portal/StatusBadge";
import {
  WEEKDAYS, easternKey, todayKey, shiftKey, startOfWeekKey, twoWeekGrid,
  rangeLabel, safeKey, fmtTime,
} from "@/lib/calendar";
import type { Job } from "@prisma/client";

export const metadata = { title: "Calendar" };

const chipStyle: Record<string, string> = {
  SCHEDULED: "bg-navy-100 text-navy-800 hover:bg-navy-200",
  IN_PROGRESS: "bg-amber-100 text-amber-900 hover:bg-amber-200",
  COMPLETED: "bg-green-100 text-green-800 hover:bg-green-200",
  CANCELLED: "bg-red-100 text-red-700 line-through",
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; q?: string }>;
}) {
  const user = await requireRole("ADMIN", "EMPLOYEE");
  const { start: startParam, q: qParam } = await searchParams;
  const q = (qParam ?? "").trim().slice(0, 100);

  // Search spans the WHOLE calendar (not just the visible two weeks) — used
  // to find past events and duplicate them onto a new date.
  const searchResults = q
    ? await db.job.findMany({
        where: {
          ...(user.role === "EMPLOYEE" ? { assignments: { some: { userId: user.id } } } : {}),
          OR: [
            { customerName: { contains: q } },
            { service: { contains: q } },
            { address: { contains: q } },
          ],
        },
        orderBy: { scheduledAt: "desc" },
        take: 30,
        include: { assignments: { include: { user: { select: { name: true } } } } },
      })
    : [];

  // Two-week window, navigable in 14-day steps via ?start=YYYY-MM-DD.
  const startKey = startOfWeekKey(safeKey(startParam));
  const grid = twoWeekGrid(startKey);

  // Generous instant bounds (±1 day) so timezone edges and multi-day jobs are
  // captured; exact placement is done by Eastern calendar date below.
  const windowStart = new Date(shiftKey(startKey, -1) + "T00:00:00.000Z");
  const windowEnd = new Date(shiftKey(startKey, 15) + "T00:00:00.000Z");

  const jobs = await db.job.findMany({
    where: {
      ...(user.role === "EMPLOYEE" ? { assignments: { some: { userId: user.id } } } : {}),
      OR: [
        { scheduledAt: { gte: windowStart, lt: windowEnd } },
        { endAt: { gte: windowStart, lt: windowEnd } },
        { AND: [{ scheduledAt: { lt: windowStart } }, { endAt: { gte: windowEnd } }] },
      ],
    },
    orderBy: { scheduledAt: "asc" },
    include: { assignments: { include: { user: { select: { name: true } } } } },
  });

  type JobRow = Job & { assignments: { user: { name: string } }[] };

  // Bucket each job onto every Eastern day it covers (start..end).
  const byDay = new Map<string, { job: JobRow; isStart: boolean; spanning: boolean }[]>();
  for (const job of jobs as JobRow[]) {
    const sKey = easternKey(job.scheduledAt);
    const eKey = job.endAt ? easternKey(job.endAt) : sKey;
    const spanning = eKey !== sKey;
    for (const cell of grid) {
      if (cell.key >= sKey && cell.key <= eKey) {
        if (!byDay.has(cell.key)) byDay.set(cell.key, []);
        byDay.get(cell.key)!.push({ job, isStart: cell.key === sKey, spanning });
      }
    }
  }

  const jobHref = (id: string) =>
    user.role === "ADMIN" ? `/portal/admin/jobs/${id}` : `/portal/employee/jobs/${id}`;

  const prev = shiftKey(startKey, -14);
  const next = shiftKey(startKey, 14);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">Calendar</h1>
        <div className="flex items-center gap-2">
          {user.role === "ADMIN" && (
            <Link href="/portal/admin/schedule/import" className="btn-small-outline">Import Google Calendar</Link>
          )}
          <Link href={`/portal/calendar?start=${prev}`} className="btn-small-outline">← Previous</Link>
          <Link href="/portal/calendar" className="btn-small-outline">Today</Link>
          <Link href={`/portal/calendar?start=${next}`} className="btn-small-outline">Next →</Link>
        </div>
      </div>
      <p className="text-sm font-medium text-gray-600">{rangeLabel(startKey)} · two-week view</p>

      {/* Calendar search — find any event, past or future, and duplicate it */}
      <form method="GET" action="/portal/calendar" className="flex flex-wrap items-center gap-2">
        {startParam && <input type="hidden" name="start" value={startParam} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search the calendar — customer, service, or address…"
          className="input !w-full sm:!w-96"
          aria-label="Search calendar events"
        />
        <button type="submit" className="btn-small">Search</button>
        {q && (
          <Link href="/portal/calendar" className="text-sm font-medium text-accent-600 hover:underline">
            Clear
          </Link>
        )}
      </form>

      {q && (
        <section className="card">
          <h2 className="font-bold text-navy">
            {searchResults.length === 0
              ? `No events match “${q}”`
              : `${searchResults.length} event${searchResults.length === 1 ? "" : "s"} matching “${q}”`}
          </h2>
          <ul className="mt-3 space-y-2">
            {searchResults.map((j) => (
              <li key={j.id} className="rounded-lg bg-navy-50 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link href={jobHref(j.id)} className="font-semibold text-navy hover:underline">
                      {j.customerName} · {j.service}
                    </Link>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {fmtWhen(j.scheduledAt, j.window)} · {j.address}
                      {j.assignments.length > 0 && <> · {j.assignments.map((a) => a.user.name).join(", ")}</>}
                    </p>
                  </div>
                  <JobStatusBadge status={j.status} />
                </div>
                {user.role === "ADMIN" && (
                  <form action={duplicateJob} className="mt-2 flex flex-wrap items-center gap-2 border-t border-navy-100 pt-2">
                    <input type="hidden" name="jobId" value={j.id} />
                    <span className="text-xs font-medium text-gray-500">Duplicate onto:</span>
                    <input type="date" name="scheduledDate" required className="input !w-auto" aria-label="New date" />
                    <select name="window" className="input !w-auto" defaultValue={j.window ?? "AM"} aria-label="Arrival window">
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                      <option value="AM/PM">AM/PM</option>
                    </select>
                    <button type="submit" className="btn-small-outline">Duplicate</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-7 gap-2">
        {/* weekday headers */}
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-xs font-semibold uppercase tracking-wide text-gray-400">
            {d}
          </div>
        ))}

        {grid.map((day) => {
          const items = byDay.get(day.key) ?? [];
          return (
            <div
              key={day.key}
              className={`min-h-[110px] rounded-lg border p-1.5 ${day.isToday ? "border-accent bg-accent-50/40" : "border-gray-200 bg-white"}`}
            >
              <div className="mb-1 text-right text-sm font-bold">
                <span className={day.isToday ? "text-accent-700" : "text-navy"}>
                  {day.monthShort} {day.dayNum}
                </span>
              </div>
              <ul className="space-y-1">
                {items.length === 0 && <li className="text-[11px] text-gray-300">—</li>}
                {items.map(({ job, isStart, spanning }) => (
                  <li key={job.id}>
                    <Link
                      href={jobHref(job.id)}
                      className={`block rounded px-1.5 py-1 text-[11px] leading-tight ${chipStyle[job.status]}`}
                    >
                      <span className="font-semibold">
                        {spanning && !isStart ? "↳ cont." : job.window ?? fmtTime(job.scheduledAt)}
                      </span>
                      {job.kind === "PICKUP" && (
                        <span className="ml-1 rounded bg-white/70 px-1 text-[9px] font-bold uppercase">Pickup</span>
                      )}
                      {spanning && isStart && <span className="ml-1 text-[9px]">→</span>}
                      <span className="block truncate">{job.customerName} · {job.service}</span>
                      {user.role === "ADMIN" && (
                        <span className="block truncate text-[10px] opacity-75">
                          {job.assignments.length > 0 ? job.assignments.map((a) => a.user.name).join(", ") : "Unassigned"}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-navy-200 align-middle" />Scheduled</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-amber-200 align-middle" />In progress</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-green-200 align-middle" />Completed</span>
        <span><span className="mr-1 inline-block h-3 w-3 rounded bg-red-200 align-middle" />Cancelled</span>
      </div>
    </div>
  );
}
