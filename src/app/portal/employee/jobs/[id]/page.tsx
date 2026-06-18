import { notFound } from "next/navigation";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/queries";
import { updateJobStatus, addJobNote } from "@/lib/actions/jobs";
import { addCustomerNote } from "@/lib/actions/clients";
import { JobStatusBadge } from "@/components/portal/StatusBadge";
import Attachments, { PhotoInput } from "@/components/portal/Attachments";

export const metadata = { title: "Job" };

export default async function EmployeeJobDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("EMPLOYEE", "ADMIN");
  const { id } = await params;

  // Scoped lookup: a job id that isn't assigned to this employee is a 404 —
  // the data never leaves the server.
  const job = await db.job.findFirst({
    where: user.role === "ADMIN" ? { id } : { id, technicianId: user.id },
    include: {
      client: { select: { id: true, name: true, phone: true, email: true } },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } }, attachments: true },
      },
    },
  });
  if (!job) notFound();

  const customerNotes = job.client
    ? await db.customerNote.findMany({
        where: { clientId: job.client.id },
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } } },
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">{job.customerName} · {job.service}</h1>
        <JobStatusBadge status={job.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card">
          <h2 className="font-bold text-navy">Job info</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div><dt className="font-medium text-gray-500">Customer</dt><dd>{job.customerName}</dd></div>
            <div><dt className="font-medium text-gray-500">Address</dt><dd>{job.address}</dd></div>
            <div><dt className="font-medium text-gray-500">Service needed</dt><dd>{job.service}</dd></div>
            <div><dt className="font-medium text-gray-500">Type</dt><dd>{job.kind === "PICKUP" ? "Pickup" : "Service job"}</dd></div>
            <div><dt className="font-medium text-gray-500">Time</dt><dd>{fmtDateTime(job.scheduledAt)}{job.endAt ? ` – ${fmtDateTime(job.endAt)}` : ""}</dd></div>
            {job.client && (
              <div>
                <dt className="font-medium text-gray-500">Contact</dt>
                <dd>{job.client.phone ?? "—"} · {job.client.email}</dd>
              </div>
            )}
          </dl>

          {job.status !== "CANCELLED" && (
            <form action={updateJobStatus} className="mt-5 space-y-3 border-t border-gray-100 pt-4">
              <input type="hidden" name="jobId" value={job.id} />
              <div>
                <label htmlFor="status" className="label">Update status</label>
                <select id="status" name="status" defaultValue={job.status} className="input">
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </div>
              <div>
                <label htmlFor="summary" className="label">Work summary (shown to the customer when completed)</label>
                <textarea id="summary" name="summary" rows={2} defaultValue={job.summary ?? ""} className="input" />
              </div>
              <button type="submit" className="btn-small">Save</button>
            </form>
          )}
        </section>

        <section className="card">
          <h2 className="font-bold text-navy">Job notes</h2>
          <p className="mt-1 text-xs text-gray-500">Timestamped — visible to you and the office, never the customer.</p>
          <form action={addJobNote} className="mt-3">
            <input type="hidden" name="jobId" value={job.id} />
            <textarea name="body" rows={2} placeholder="Add a note…" className="input" />
            <div className="mt-2 flex items-center justify-between">
              <PhotoInput />
              <button type="submit" className="btn-small">Add note</button>
            </div>
          </form>
          <ul className="mt-4 space-y-3">
            {job.notes.length === 0 && <li className="text-sm text-gray-500">No notes yet.</li>}
            {job.notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-navy-50 p-3 text-sm">
                <p className="whitespace-pre-wrap text-gray-800">{n.body}</p>
                <Attachments items={n.attachments} />
                <p className="mt-1 text-xs text-gray-500">{n.author.name} · {fmtDateTime(n.createdAt)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2 className="font-bold text-navy">Customer notes</h2>
          <p className="mt-1 text-xs text-gray-500">Internal history for this customer (staff only).</p>
          {job.client ? (
            <>
              <form action={addCustomerNote} className="mt-3 space-y-2">
                <input type="hidden" name="clientId" value={job.client.id} />
                <textarea name="body" required rows={2} placeholder="Add a customer note…" className="input" />
                <button type="submit" className="btn-small">Add</button>
              </form>
              <ul className="mt-4 space-y-3">
                {customerNotes.length === 0 && <li className="text-sm text-gray-500">No notes yet.</li>}
                {customerNotes.map((n) => (
                  <li key={n.id} className="rounded-lg bg-amber-50 p-3 text-sm">
                    <p className="whitespace-pre-wrap text-gray-800">{n.body}</p>
                    <p className="mt-1 text-xs text-gray-500">{n.author.name} · {fmtDateTime(n.createdAt)}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-3 text-sm text-gray-500">This job isn&apos;t linked to a portal client.</p>
          )}
        </section>
      </div>
    </div>
  );
}
