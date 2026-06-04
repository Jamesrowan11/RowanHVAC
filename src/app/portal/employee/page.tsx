import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import {
  PageHeader,
  JobStatusBadge,
  EmptyState,
  fmtDate,
} from "@/components/portal/ui";

export default async function EmployeeSchedule() {
  const user = await requireRole("EMPLOYEE", "ADMIN");

  // Only jobs assigned to this technician; cancelled jobs leave the active schedule.
  const jobs = await prisma.job.findMany({
    where: {
      technicianId: user.id,
      status: { in: ["SCHEDULED", "IN_PROGRESS", "COMPLETED"] },
    },
    orderBy: [{ scheduledDate: "asc" }],
  });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const upcoming = jobs.filter(
    (j) => j.status !== "COMPLETED" && new Date(j.scheduledDate) >= today,
  );
  const thisWeek = upcoming.filter((j) => new Date(j.scheduledDate) < weekEnd);
  const later = upcoming.filter((j) => new Date(j.scheduledDate) >= weekEnd);
  const completed = jobs
    .filter((j) => j.status === "COMPLETED")
    .sort(
      (a, b) =>
        new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime(),
    );

  const Section = ({
    title,
    list,
  }: {
    title: string;
    list: typeof jobs;
  }) => (
    <div className="mb-8">
      <h2 className="mb-3 text-lg font-semibold text-navy-900">{title}</h2>
      {list.length === 0 ? (
        <EmptyState>Nothing here.</EmptyState>
      ) : (
        <div className="space-y-3">
          {list.map((job) => (
            <Link
              key={job.id}
              href={`/portal/employee/jobs/${job.id}`}
              className="card block p-5 transition hover:shadow-soft"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-navy-900">{job.customerName}</h3>
                <JobStatusBadge status={job.status} />
              </div>
              <p className="mt-1 text-sm text-navy-600">{job.serviceNeeded}</p>
              <p className="mt-1 text-xs text-navy-500">{job.address}</p>
              <p className="mt-1 text-xs text-navy-500">
                {fmtDate(job.scheduledDate)} · {job.scheduledTime}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title="My Schedule"
        subtitle="Jobs assigned to you. Open a job to update status and add notes."
      />
      <Section title="This Week" list={thisWeek} />
      {later.length > 0 && <Section title="Upcoming" list={later} />}
      <Section title="Completed" list={completed} />
    </>
  );
}
