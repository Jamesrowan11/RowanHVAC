import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { assertRole } from "@/lib/session";
import { JobStatusBadge, fmtDate, fmtDateTime } from "@/components/portal/ui";
import { updateJobStatus, addJobNote } from "../../actions";

export default async function JobDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await assertRole("EMPLOYEE", "ADMIN");
  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } } },
      },
      client: { select: { name: true } },
    },
  });

  // Server-side ownership check — employees can only open their own jobs.
  if (!job) notFound();
  if (user.role === "EMPLOYEE" && job.technicianId !== user.id) notFound();

  return (
    <>
      <Link href="/portal/employee" className="text-sm text-accent hover:underline">
        ← Back to schedule
      </Link>

      <div className="card mt-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-navy-900">{job.customerName}</h1>
          <JobStatusBadge status={job.status} />
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-navy-400">Service needed</dt>
            <dd className="font-medium text-navy-900">{job.serviceNeeded}</dd>
          </div>
          <div>
            <dt className="text-navy-400">Appointment</dt>
            <dd className="font-medium text-navy-900">
              {fmtDate(job.scheduledDate)} · {job.scheduledTime}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-navy-400">Address</dt>
            <dd className="font-medium text-navy-900">{job.address}</dd>
          </div>
        </dl>

        {job.status === "CANCELLED" && (
          <p className="mt-4 rounded-lg bg-navy-50 p-3 text-sm text-navy-600">
            This job was cancelled{job.cancelReason ? `: ${job.cancelReason}` : "."}
          </p>
        )}
      </div>

      {/* Update status */}
      {job.status !== "CANCELLED" && (
        <div className="card mt-6 p-6">
          <h2 className="mb-3 text-lg font-semibold text-navy-900">Update Status</h2>
          <form action={updateJobStatus} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="jobId" value={job.id} />
            <div>
              <label className="label">Status</label>
              <select name="status" className="input !w-auto" defaultValue={job.status}>
                <option value="SCHEDULED">Scheduled</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="label">Completion summary (shown to client)</label>
              <input
                name="summary"
                className="input"
                placeholder="Optional — e.g. Replaced capacitor, system cooling normally."
                defaultValue={job.summary ?? ""}
              />
            </div>
            <button type="submit" className="btn-primary">Save</button>
          </form>
        </div>
      )}

      {/* Notes */}
      <div className="card mt-6 p-6">
        <h2 className="mb-1 text-lg font-semibold text-navy-900">Job Notes</h2>
        <p className="mb-4 text-xs text-navy-400">
          Internal notes — visible to technicians and admins only, never to clients.
        </p>

        {job.status !== "CANCELLED" && (
          <form action={addJobNote} className="mb-4 space-y-2">
            <input type="hidden" name="jobId" value={job.id} />
            <textarea
              name="body"
              rows={3}
              className="input"
              placeholder="Add a timestamped note…"
              required
            />
            <button type="submit" className="btn-navy btn-sm">Add Note</button>
          </form>
        )}

        {job.notes.length === 0 ? (
          <p className="text-sm text-navy-500">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {job.notes.map((n) => (
              <li key={n.id} className="border-l-2 border-navy-100 pl-3">
                <p className="text-xs text-navy-400">
                  {n.author.name} · {fmtDateTime(n.createdAt)}
                </p>
                <p className="whitespace-pre-wrap text-sm text-navy-700">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
