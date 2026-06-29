import Link from "next/link";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
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
  searchParams: Promise<{ start?: string }>;
}) {
  const user = await requireRole("ADMIN", "EMPLOYEE");
  const { start: startParam } = await searchParams;

  // Two-week window, navigable in 14-day steps via ?start=YYYY-MM-DD.
  const startKey = startOfWeekKey(safeKey(startParam));
  const grid = twoWeekGrid(startKey);

  // Generous instant bounds (±1 day) so timezone edges and multi-day jobs are
  // captured; exact placement is done by Eastern calendar date below.
  const windowStart = new Date(shiftKey(startKey, -1) + "T00:00:00.000Z");
  const windowEnd = new Date(shiftKey(startKey, 15) + "T00:00:00.000Z");

  const jobs = await db.job.findMany({
    where: {
      ...(user.role === "EMPLOYEE" ? { technicianId: user.id } : {}),
      OR: [
        { scheduledAt: { gte: windowStart, lt: windowEnd } },
        { endAt: { gte: windowStart, lt: windowEnd } },
        { AND: [{ scheduledAt: { lt: windowStart } }, { endAt: { gte: windowEnd } }] },
      ],
    },
    orderBy: { scheduledAt: "asc" },
    include: { technician: { select: { name: true } } },
  });

  type JobRow = Job & { technician: { name: string } };

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
          <Link href={`/portal/calendar?start=${prev}`} className="btn-small-outline">← Previous</Link>
          <Link href="/portal/calendar" className="btn-small-outline">Today</Link>
          <Link href={`/portal/calendar?start=${next}`} className="btn-small-outline">Next →</Link>
        </div>
      </div>
      <p className="text-sm font-medium text-gray-600">{rangeLabel(startKey)} · two-week view</p>

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
                        {spanning && !isStart ? "↳ cont." : fmtTime(job.scheduledAt)}
                      </span>
                      {job.kind === "PICKUP" && (
                        <span className="ml-1 rounded bg-white/70 px-1 text-[9px] font-bold uppercase">Pickup</span>
                      )}
                      {spanning && isStart && <span className="ml-1 text-[9px]">→</span>}
                      <span className="block truncate">{job.customerName} · {job.service}</span>
                      {user.role === "ADMIN" && (
                        <span className="block truncate text-[10px] opacity-75">{job.technician.name}</span>
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
