import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDateTime, fmtWhen } from "@/lib/queries";
import {
  updateJobStatus, addJobNote, deleteJobNote, cancelJob, reinstateJob, assignTechnicians, deleteJob,
  sendTermsAcceptance, setJobClient,
} from "@/lib/actions/jobs";
import { createTicketDraft } from "@/lib/actions/tickets";
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
        tickets: {
          orderBy: { createdAt: "asc" },
          include: { tech: { select: { name: true } } },
        },
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

  const clients = await db.user.findMany({
    where: { role: "CLIENT" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, customerNumber: true },
  });
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
            <div><dt className="font-medium text-gray-500">When</dt><dd>{fmtWhen(job.scheduledAt, job.window)}{job.endAt ? ` – ${fmtDateTime(job.endAt)}` : ""}</dd></div>
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
              {/* Link/change the client after the fact — appointments often get
                  created before the customer has an account. */}
              <form action={setJobClient} className="mt-1.5 flex items-center gap-2">
                <input type="hidden" name="jobId" value={job.id} />
                <select name="clientId" className="input flex-1" defaultValue={job.client?.id ?? ""} aria-label="Link to portal client">
                  <option value="">— No portal account —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.customerNumber ? ` · #${c.customerNumber}` : ""}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn-small-outline">Save</button>
              </form>
              {!job.client && (
                <p className="mt-1 text-xs text-gray-500">
                  Linking sends them the pricing-terms &amp; agreement request automatically.
                </p>
              )}
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
          <h2 className="font-bold text-navy">Pricing terms &amp; agreement acceptance</h2>
          <p className="mt-1 text-xs text-gray-500">
            The customer must accept the hourly pricing terms and service agreement
            (checkbox + typed signature) by one day before the appointment. It sends
            automatically when the job is scheduled for a linked client. Edit the
            agreement text on the Price Book page.
          </p>

          <div className="mt-3 rounded-lg bg-navy-50 p-3 text-sm">
            {job.termsAcceptedAt ? (
              <p className="text-green-700">
                ✓ Accepted {fmtDateTime(job.termsAcceptedAt)} — signed <em>{job.termsSignature}</em>
              </p>
            ) : job.termsSentAt ? (
              <p className={`${new Date() > new Date(new Date(job.scheduledAt).getTime() - 24 * 60 * 60 * 1000) ? "font-medium text-red-600" : "text-amber-800"}`}>
                ⏳ Sent {fmtDateTime(job.termsSentAt)} — not accepted yet
                {new Date() > new Date(new Date(job.scheduledAt).getTime() - 24 * 60 * 60 * 1000) && " (past the 1-day-before deadline!)"}
              </p>
            ) : (
              <p className="text-gray-500">Not sent yet{job.client ? "" : " — link a portal client to send it"}.</p>
            )}
            {job.client && job.status !== "CANCELLED" && (
              <form action={sendTermsAcceptance} className="mt-2">
                <input type="hidden" name="jobId" value={job.id} />
                <button type="submit" className="btn-small-outline">
                  {job.termsSentAt ? "Re-send terms & agreement" : "Send terms & agreement"}
                </button>
              </form>
            )}
          </div>
        </section>

        <section className="card lg:col-span-2">
          <h2 className="font-bold text-navy">Service tickets</h2>
          <ul className="mt-3 space-y-2">
            {job.tickets.length === 0 && (
              <li className="text-sm text-gray-500">No ticket filed for this job yet.</li>
            )}
            {job.tickets.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-navy-50 p-3 text-sm">
                <div>
                  <p className="font-semibold text-navy">Ticket #{t.ticketNumber} — {t.tech.name}</p>
                  <p className="text-xs text-gray-500">
                    {t.status === "DRAFT" ? "Draft" : "Submitted"}
                    {t.total != null && <> · ${Number(t.total).toFixed(2)}</>}
                    {t.exportedAt && " · exported"}
                  </p>
                </div>
                <Link
                  href={t.status === "DRAFT" ? `/portal/employee/tickets/${t.id}` : `/portal/admin/tickets/${t.id}`}
                  className="btn-small-outline whitespace-nowrap"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
          {job.status !== "CANCELLED" && (
            <form action={createTicketDraft} className="mt-3">
              <input type="hidden" name="jobId" value={job.id} />
              <button type="submit" className="btn-small">Start ticket for this job</button>
            </form>
          )}
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
