import Link from "next/link";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/queries";
import { JobStatusBadge } from "@/components/portal/StatusBadge";
import { pickUpJob, addJobNote } from "@/lib/actions/jobs";
import ConfirmForm from "@/components/portal/ConfirmForm";
import { PhotoInput } from "@/components/portal/Attachments";
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

  const [today, thisWeek, later, recentDone, available, announcements] = await Promise.all([
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
    // Teammates' still-unstarted jobs for today, available to pick up.
    db.job.findMany({
      where: {
        technicianId: { not: user.id },
        status: "SCHEDULED",
        scheduledAt: { gte: startOfDay, lt: endOfDay },
        technician: { active: true },
      },
      orderBy: { scheduledAt: "asc" },
      include: { technician: { select: { name: true } } },
    }),
    db.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 3 }),
  ]);

  // Job picker for the "Upload your work" section — the tech's recent jobs.
  const myRecentJobs = await db.job.findMany({
    where: { technicianId: user.id, status: { not: "CANCELLED" } },
    orderBy: { scheduledAt: "desc" },
    take: 25,
    select: { id: true, customerName: true, service: true, scheduledAt: true },
  });

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

      <section className="card border-l-4 border-accent">
        <h2 className="font-bold text-navy">Available to pick up today</h2>
        <p className="mt-1 text-xs text-gray-500">
          Done with yours and a teammate still has jobs? Grab one to help out — it
          moves to your schedule and the office is notified.
        </p>
        {available.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No open jobs to pick up right now.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {available.map((j) => (
              <li
                key={j.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy-50 p-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-navy">{j.customerName} · {j.service}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {fmtDateTime(j.scheduledAt)} · {j.address}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">Currently: {j.technician.name}</p>
                </div>
                <ConfirmForm
                  action={pickUpJob}
                  confirmText={`Pick up ${j.customerName}'s ${j.service}? It will move to your schedule.`}
                >
                  <input type="hidden" name="jobId" value={j.id} />
                  <button type="submit" className="btn-small">Pick up</button>
                </ConfirmForm>
              </li>
            ))}
          </ul>
        )}
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

      {/* Upload your work — photos + note filed onto the job for the office */}
      <section className="card border-l-4 border-navy-300">
        <h2 className="font-bold text-navy">Upload your work</h2>
        <p className="mt-1 text-xs text-gray-500">
          Add photos of the work you did (before/after, installs, repairs). They
          attach to the job so the office can see them — never the customer.
        </p>
        {myRecentJobs.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No jobs yet — once you have a job, you can upload photos here.</p>
        ) : (
          <form action={addJobNote} className="mt-3 space-y-3">
            <div>
              <label htmlFor="work-job" className="label">Which job?</label>
              <select id="work-job" name="jobId" required className="input" defaultValue="">
                <option value="" disabled>Select a job…</option>
                {myRecentJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {fmtDateTime(j.scheduledAt)} — {j.customerName} · {j.service}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="work-body" className="label">Notes about the work (optional)</label>
              <textarea id="work-body" name="body" rows={2} placeholder="Replaced condenser fan motor, tested, running normal…" className="input" />
            </div>
            <div className="flex items-center justify-between">
              <PhotoInput />
              <button type="submit" className="btn-small">Upload work</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
