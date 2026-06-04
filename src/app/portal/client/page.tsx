import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import {
  PageHeader,
  JobStatusBadge,
  EmptyState,
  fmtDate,
} from "@/components/portal/ui";

export default async function ClientAppointments() {
  const user = await requireRole("CLIENT");

  const jobs = await prisma.job.findMany({
    where: { clientId: user.id },
    orderBy: { scheduledDate: "desc" },
  });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const upcoming = jobs.filter(
    (j) =>
      j.status !== "COMPLETED" &&
      j.status !== "CANCELLED" &&
      new Date(j.scheduledDate) >= today,
  );
  const past = jobs.filter((j) => !upcoming.includes(j));

  const Card = ({ job }: { job: (typeof jobs)[number] }) => (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-navy-900">{job.serviceNeeded}</h3>
        <JobStatusBadge status={job.status} />
      </div>
      <p className="mt-1 text-sm text-navy-500">
        {fmtDate(job.scheduledDate)} · {job.scheduledTime}
      </p>
      {job.status === "COMPLETED" && job.summary && (
        <p className="mt-2 rounded-lg bg-navy-50 p-3 text-sm text-navy-700">
          {job.summary}
        </p>
      )}
      {job.status === "CANCELLED" && (
        <p className="mt-2 text-xs text-navy-500">This appointment was cancelled.</p>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        subtitle="Your upcoming and past appointments."
        action={
          <Link href="/portal/client/request" className="btn-primary btn-sm">
            New Request
          </Link>
        }
      />

      <h2 className="mb-3 text-lg font-semibold text-navy-900">Upcoming</h2>
      {upcoming.length === 0 ? (
        <EmptyState>
          No upcoming appointments.{" "}
          <Link href="/portal/client/request" className="text-accent hover:underline">
            Submit a request
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {upcoming.map((j) => (
            <Card key={j.id} job={j} />
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold text-navy-900">Past</h2>
      {past.length === 0 ? (
        <EmptyState>No past appointments yet.</EmptyState>
      ) : (
        <div className="space-y-3">
          {past.map((j) => (
            <Card key={j.id} job={j} />
          ))}
        </div>
      )}
    </>
  );
}
