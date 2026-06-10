import Link from "next/link";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/queries";
import { JobStatusBadge } from "@/components/portal/StatusBadge";
import type { Job } from "@prisma/client";

export const metadata = { title: "My Schedule" };

function JobList({ jobs, empty }: { jobs: Job[]; empty: string }) {
  if (jobs.length === 0) return <p className="mt-3 text-sm text-gray-500">{empty}</p>;
  return (
    <ul className="mt-3 space-y-2">
      {jobs.map((j) => (
        <li key={j.id}>
          <Link
            href={`/portal/employee/jobs/${j.id}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy-50 p-3 text-sm transition hover:bg-navy-100"
          >
            <div>
              <p className="font-semibold text-navy">{j.customerName} · {j.service}</p>
              <p className="mt-0.5 text-xs text-gray-500">{fmtDateTime(j.scheduledAt)} · {j.address}</p>
            </div>
            <JobStatusBadge status={j.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function EmployeeSchedule() {
  const user = await requireRole("EMPLOYEE", "ADMIN");

  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay); endOfDay.setDate(endOfDay.getDate() + 1);
  const endOfWeek = new Date(startOfDay); endOfWeek.setDate(endOfWeek.getDate() + 7);

  // Employees only ever see jobs assigned to them. Cancelled jobs leave the
  // active schedule entirely.
  const baseWhere = { technicianId: user.id, status: { not: "CANCELLED" as const } };

  const [today, thisWeek, later, recentDone, announcements] = await Promise.all([
    db.job.findMany({
      where: { ...baseWhere, scheduledAt: { gte: startOfDay, lt: endOfDay } },
      orderBy: { scheduledAt: "asc" },
    }),
    db.job.findMany({
      where: { ...baseWhere, scheduledAt: { gte: endOfDay, lt: endOfWeek } },
      orderBy: { scheduledAt: "asc" },
    }),
    db.job.findMany({
      where: { ...baseWhere, scheduledAt: { gte: endOfWeek }, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      orderBy: { scheduledAt: "asc" },
      take: 20,
    }),
    db.job.findMany({
      where: { technicianId: user.id, status: "COMPLETED", scheduledAt: { lt: startOfDay } },
      orderBy: { scheduledAt: "desc" },
      take: 10,
    }),
    db.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 3 }),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-navy">My Schedule</h1>

      {announcements.length > 0 && (
        <section className="card border-l-4 border-accent">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-navy">Latest announcements</h2>
            <Link href="/portal/employee/announcements" className="text-sm font-medium text-accent-600 hover:underline">
              View all
            </Link>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-gray-700">
            {announcements.map((a) => (
              <li key={a.id}><span className="font-medium text-navy">{a.title}</span> — {fmtDateTime(a.createdAt)}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2 className="font-bold text-navy">Today</h2>
        <JobList jobs={today} empty="Nothing scheduled today." />
      </section>

      <section className="card">
        <h2 className="font-bold text-navy">Next 7 days</h2>
        <JobList jobs={thisWeek} empty="Nothing scheduled this week." />
      </section>

      <section className="card">
        <h2 className="font-bold text-navy">Further out</h2>
        <JobList jobs={later} empty="Nothing scheduled beyond this week." />
      </section>

      <section className="card">
        <h2 className="font-bold text-navy">Recently completed</h2>
        <JobList jobs={recentDone} empty="No completed jobs yet." />
      </section>
    </div>
  );
}
