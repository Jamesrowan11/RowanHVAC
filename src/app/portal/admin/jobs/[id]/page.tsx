import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/queries";
import {
  updateJobStatus, addJobNote, deleteJobNote, cancelJob, reinstateJob, assignTechnicians, deleteJob,
} from "@/lib/actions/jobs";
import { JobStatusBadge } from "@/components/portal/StatusBadge";
import ConfirmForm from "@/components/portal/ConfirmForm";
import Attachments, { PhotoInput } from "@/components/portal/Attachments";

export const metadata = { title: "Job Details" };

export default async function AdminJobDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("ADMIN");
  const { id } = await params;

  const [job, technicians] = await Promise.all([
    db.job.findUnique({
      where: { id },
      include: {
        assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
        client: { select: { id: true, name: true, email: true } },
        notes: {
          orderBy: { createdAt: "desc" },
          include: { author: { select: { name: true } }, attachments: true },
        },
      },
    }),
    db.user.findMany({
      where: { active: true, role: { in: ["EMPLOYEE", "ADMIN"] } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
  ]);
  if (!job) notFound();
  const employees = technicians.filter((t) => t.role === "EMPLOYEE");
  const admins = technicians.filter((t) => t.role === "ADMIN");
  const assignedIds = new Set(job.assignments.map((a) => a.user.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">
          {job.customerName} · {job.service}
        </h1>
        <JobStatusBadge status={job.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-1">
          <h2 className="font-bold text-navy">Details</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div><dt className="font-medium text-gray-500">Type</dt><dd>{job.kind === "PICKUP" ? "Pickup" : "Service job"}</dd></div>
            <div><dt className="font-medium text-gray-500">When</dt><dd>{fmtDateTime(job.scheduledAt)}{job.endAt ? ` – ${fmtDateTime(job.endAt)}` : ""}</dd></div>
            <div><dt className="font-medium text-gray-500">Address</dt><dd>{job.address}</dd></div>
            <div>
              <dt className="font-medium text-gray-500">Technicians</dt>
              <dd>
                {job.assignments.length > 0 ? (
                  job.assignments.map((a) => a.user.name).join(", ")
                ) : (
                  <span className="italic text-gray-400">Unassigned</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-500">Portal client</dt>
              <dd>
                {job.client ? (
                  <Link href={`/portal/admin/users/${job.client.id}`} className="text-accent-600 hover:underline">
                    {job.client.name}
                  </Link>
                ) : (
                  "Not linked"
                )}
              </dd>
            </div>
            {job.summary && (
              <div><dt className="font-medium text-gray-500">Summary</dt><dd className="whitespace-pre-wrap">{job.summary}</dd></div>
            )}
            {job.status === "CANCELLED" && (
              <div>
                <dt className="font-medium text-red-600">Cancelled {job.cancelledAt ? fmtDateTime(job.cancelledAt) : ""}</dt>
                <dd className="whitespace-pre-wrap">{job.cancelReason}</dd>
              </div>
            )}
          </dl>

          {job.status !== "CANCELLED" ? (
            <div className="mt-6 space-y-4 border-t border-gray-100 pt-4">
              <form action={assignTechnicians} className="space-y-2">
                <input type="hidden" name="jobId" value={job.id} />
                <label htmlFor="technicianIds" className="label">Assign technicians (any number)</label>
                <select
                  id="technicianIds"
                  name="technicianIds"
                  multiple
                  size={5}
                  className="input"
                  defaultValue={[...assignedIds]}
                >
                  <optgroup label="Employees">
                    {employees.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Admins">
                    {admins.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </optgroup>
                </select>
                <p className="text-xs text-gray-500">Cmd/Ctrl-click to select several. Saving replaces the current list.</p>
                <button type="submit" className="btn-small">Save assignments</button>
              </form>

              <form action={updateJobStatus} className="flex items-end gap-2">
                <input type="hidden" name="jobId" value={job.id} />
                <div className="flex-1">
                  <label htmlFor="status" className="label">Update status</label>
                  <select id="status" name="status" defaultValue={job.status} className="input">
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>
                <button type="submit" className="btn-small">Save</button>
              </form>

              <ConfirmForm
                action={cancelJob}
                confirmText="Cancel this job? It will leave every assigned technician's schedule and show as Cancelled for the client."
                className="space-y-2"
              >
                <input type="hidden" name="jobId" value={job.id} />
                <label htmlFor="reason" className="label">Cancel job — reason (required)</label>
                <textarea id="reason" name="reason" required rows={2} className="input" />
                <button type="submit" className="btn-danger">Cancel job</button>
              </ConfirmForm>
            </div>
          ) : (
            <div className="mt-6 space-y-4 border-t border-gray-100 pt-4">
              <form action={reinstateJob}>
                <input type="hidden" name="jobId" value={job.id} />
                <button type="submit" className="btn-small">Reinstate to Scheduled</button>
              </form>
            </div>
          )}

          <div className="mt-6 border-t border-gray-100 pt-4">
            <ConfirmForm
              action={deleteJob}
              confirmText={`Permanently delete this job for ${job.customerName}? This removes it and all its notes/photos for good — it can't be undone. Cancel it instead if you just want it off the active schedule.`}
            >
              <input type="hidden" name="jobId" value={job.id} />
              <button type="submit" className="btn-danger">Delete job permanently</button>
            </ConfirmForm>
          </div>
        </section>

        <section className="card lg:col-span-2">
          <h2 className="font-bold text-navy">Job Notes</h2>
          <p className="mt-1 text-xs text-gray-500">
            Visible to admins and assigned technicians — never to the client.
          </p>
          <form action={addJobNote} className="mt-4">
            <input type="hidden" name="jobId" value={job.id} />
            <textarea
              name="body"
              rows={2}
              placeholder="Add a note…"
              className="input"
            />
            <div className="mt-2 flex items-center justify-between">
              <PhotoInput />
              <button type="submit" className="btn-small">Add</button>
            </div>
          </form>
          <ul className="mt-4 space-y-3">
            {job.notes.length === 0 && <li className="text-sm text-gray-500">No notes yet.</li>}
            {job.notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-navy-50 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="whitespace-pre-wrap text-gray-800">{n.body}</p>
                  <form action={deleteJobNote}>
                    <input type="hidden" name="noteId" value={n.id} />
                    <button type="submit" className="whitespace-nowrap text-xs font-medium text-red-600 hover:underline">
                      Delete
                    </button>
                  </form>
                </div>
                <Attachments items={n.attachments} />
                <p className="mt-1 text-xs text-gray-500">
                  {n.author.name} · {fmtDateTime(n.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
