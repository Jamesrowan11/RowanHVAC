import Link from "next/link";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import {
  startOfWeek, addDays, twoWeekGrid, dayKey, fmtDayHeader, fmtTime, isToday,
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

  // Two-week window; navigable in 14-day steps via ?start=YYYY-MM-DD.
  const base = startParam ? new Date(startParam + "T12:00:00") : new Date();
  const start = startOfWeek(base);
  const end = addDays(start, 14);
  const grid = twoWeekGrid(start);

  // Admins see all work; technicians see only their own.
  const jobs = await db.job.findMany({
    where: {
      scheduledAt: { gte: start, lt: end },
      ...(user.role === "EMPLOYEE" ? { technicianId: user.id } : {}),
    },
    orderBy: { scheduledAt: "asc" },
    include: { technician: { select: { name: true } } },
  });

  // Bucket jobs by Eastern day.
  const byDay = new Map<string, (Job & { technician: { name: string } })[]>();
  for (const job of jobs) {
    const k = dayKey(job.scheduledAt);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(job);
  }

  const jobHref = (id: string) =>
    user.role === "ADMIN" ? `/portal/admin/jobs/${id}` : `/portal/employee/jobs/${id}`;

  const prev = dayKey(addDays(start, -14));
  const next = dayKey(addDays(start, 14));
  const rangeLabel = `${fmtDayHeader(start).month} ${fmtDayHeader(start).day} – ${fmtDayHeader(addDays(start, 13)).month} ${fmtDayHeader(addDays(start, 13)).day}`;

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
      <p className="text-sm font-medium text-gray-600">{rangeLabel} · two-week view</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
        {/* weekday headers (desktop) */}
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="hidden text-center text-xs font-semibold uppercase tracking-wide text-gray-400 sm:block">
            {d}
          </div>
        ))}

        {grid.map(({ date, key }) => {
          const dayJobs = byDay.get(key) ?? [];
          const head = fmtDayHeader(date);
          return (
            <div
              key={key}
              className={`min-h-[110px] rounded-lg border p-2 ${isToday(date) ? "border-accent bg-accent-50/40" : "border-gray-200 bg-white"}`}
            >
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-xs font-semibold text-gray-500 sm:hidden">{head.weekday}</span>
                <span className={`text-sm font-bold ${isToday(date) ? "text-accent-700" : "text-navy"}`}>
                  {head.month} {head.day}
                </span>
              </div>
              <ul className="space-y-1">
                {dayJobs.length === 0 && <li className="text-[11px] text-gray-300">—</li>}
                {dayJobs.map((job) => (
                  <li key={job.id}>
                    <Link
                      href={jobHref(job.id)}
                      className={`block rounded px-1.5 py-1 text-[11px] leading-tight ${chipStyle[job.status]}`}
                    >
                      <span className="font-semibold">{fmtTime(job.scheduledAt)}</span>
                      {job.kind === "PICKUP" && (
                        <span className="ml-1 rounded bg-white/70 px-1 text-[9px] font-bold uppercase">Pickup</span>
                      )}
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
