import { notFound } from "next/navigation";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/queries";
import Link from "next/link";
import { updateJobStatus, addJobNote, deleteJobNote, notifyOnMyWay, askNextUp } from "@/lib/actions/jobs";
import { createTicketDraft } from "@/lib/actions/tickets";
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
    where: user.role === "ADMIN" ? { id } : { id, assignments: { some: { userId: user.id } } },
    include: {
      client: { select: { id: true, name: true, phone: true, email: true } },
      tickets: {
        orderBy: { createdAt: "asc" },
        include: { tech: { select: { id: true, name: true } } },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { id: true, name: true } }, attachments: true },
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

          {job.status !== "CANCELLED" && job.status !== "COMPLETED" && job.client && (
            <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
              <form action={notifyOnMyWay}>
                <input type="hidden" name="jobId" value={job.id} />
                <label htmlFor="eta" className="label">Let the customer know you&apos;re on the way</label>
                <div className="flex items-end gap-2">
                  <input id="eta" name="eta" placeholder="ETA e.g. 20 minutes (optional)" className="input flex-1" />
                  <button type="submit" className="btn-small">On my way</button>
                </div>
                <p className="mt-1 text-xs text-gray-500">Sends the customer an email and text.</p>
              </form>

              <form action={askNextUp}>
                <input type="hidden" name="jobId" value={job.id} />
                <label className="label">Confirm before you head over</label>
                {job.confirmStatus === "READY" ? (
                  <p className="text-sm font-medium text-green-700">✅ Customer confirmed: ready now.</p>
                ) : job.confirmStatus === "WAIT" ? (
                  <p className="text-sm font-medium text-amber-700">⏳ Customer asked to wait — follow up before going.</p>
                ) : job.confirmStatus === "ASKED" ? (
                  <p className="text-sm text-gray-500">Asked — waiting for the customer to respond.</p>
                ) : null}
                <button type="submit" className="btn-small mt-1">
                  {job.confirmStatus ? "Ask again: are you next-ready?" : "Ask customer: ready to be next?"}
                </button>
                <p className="mt-1 text-xs text-gray-500">
                  Texts/emails the customer a link to confirm now or ask to wait.
                </p>
              </form>
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="font-bold text-navy">Service ticket</h2>
          <p className="mt-1 text-xs text-gray-500">
            The field ticket for this visit — time, readings, work performed,
            parts, and photos. It drives the bill.
          </p>
          <ul className="mt-3 space-y-2">
            {job.tickets.length === 0 && (
              <li className="text-sm text-gray-500">No ticket yet for this job.</li>
            )}
            {job.tickets.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-navy-50 p-3 text-sm">
                <div>
                  <p className="font-semibold text-navy">Ticket #{t.ticketNumber}</p>
                  <p className="text-xs text-gray-500">
                    {t.tech.name} · {t.status === "DRAFT" ? "Draft" : `Submitted${t.total != null ? ` · $${Number(t.total).toFixed(2)}` : ""}`}
                  </p>
                </div>
                {(user.role === "ADMIN" || t.tech.id === user.id) && (
                  <Link href={`/portal/employee/tickets/${t.id}`} className="btn-small-outline whitespace-nowrap">
                    {t.status === "DRAFT" ? "Continue" : "View"}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {job.status !== "CANCELLED" && (
            <form action={createTicketDraft} className="mt-3">
              <input type="hidden" name="jobId" value={job.id} />
              <button type="submit" className="btn-small">
                Start ticket for this job
              </button>
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
                <div className="flex items-start justify-between gap-2">
                  <p className="whitespace-pre-wrap text-gray-800">{n.body}</p>
                  {(user.role === "ADMIN" || n.author.id === user.id) && (
                    <form action={deleteJobNote}>
                      <input type="hidden" name="noteId" value={n.id} />
                      <button type="submit" className="whitespace-nowrap text-xs font-medium text-red-600 hover:underline">
                        Delete
                      </button>
                    </form>
                  )}
                </div>
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
