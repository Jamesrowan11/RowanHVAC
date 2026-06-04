import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import {
  PageHeader,
  JobStatusBadge,
  EmptyState,
  fmtDate,
  fmtDateTime,
} from "@/components/portal/ui";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import { createJob, cancelJob, reinstateJob } from "../actions";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ fromRequest?: string }>;
}) {
  await requireRole("ADMIN");
  const { fromRequest } = await searchParams;

  const [techs, clients, jobs, prefill] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, role: { in: ["EMPLOYEE", "ADMIN"] } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, role: true },
    }),
    prisma.user.findMany({
      where: { role: "CLIENT", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    prisma.job.findMany({
      orderBy: [{ scheduledDate: "desc" }],
      include: {
        technician: { select: { name: true, role: true } },
        client: { select: { name: true } },
        notes: {
          orderBy: { createdAt: "desc" },
          include: { author: { select: { name: true } } },
        },
      },
    }),
    fromRequest
      ? prisma.request.findUnique({ where: { id: fromRequest } })
      : Promise.resolve(null),
  ]);

  const employees = techs.filter((t) => t.role === "EMPLOYEE");
  const admins = techs.filter((t) => t.role === "ADMIN");

  return (
    <>
      <PageHeader
        title="Scheduling"
        subtitle="Create jobs, assign a technician, and track live progress."
      />

      {/* Create job */}
      <div className="card mb-8 p-6">
        <h2 className="mb-4 text-lg font-semibold text-navy-900">
          New Job
          {prefill && (
            <span className="ml-2 text-sm font-normal text-navy-500">
              (from request by {prefill.name})
            </span>
          )}
        </h2>
        <form action={createJob} className="grid gap-4 sm:grid-cols-2">
          {fromRequest && <input type="hidden" name="requestId" value={fromRequest} />}

          <div>
            <label className="label" htmlFor="customerName">Customer name</label>
            <input
              id="customerName"
              name="customerName"
              className="input"
              required
              defaultValue={prefill?.name ?? ""}
            />
          </div>
          <div>
            <label className="label" htmlFor="address">Address</label>
            <input id="address" name="address" className="input" required />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="serviceNeeded">Service needed</label>
            <input
              id="serviceNeeded"
              name="serviceNeeded"
              className="input"
              required
              defaultValue={prefill?.serviceNeeded ?? ""}
            />
          </div>
          <div>
            <label className="label" htmlFor="scheduledDate">Date</label>
            <input id="scheduledDate" name="scheduledDate" type="date" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="scheduledTime">Time</label>
            <input
              id="scheduledTime"
              name="scheduledTime"
              className="input"
              placeholder="e.g. 9:00 AM"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="technicianId">Assign technician</label>
            <select id="technicianId" name="technicianId" className="input" defaultValue="">
              <option value="">— Unassigned —</option>
              {employees.length > 0 && (
                <optgroup label="Employees">
                  {employees.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </optgroup>
              )}
              {admins.length > 0 && (
                <optgroup label="Admins">
                  {admins.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="clientId">Link to client account</label>
            <select id="clientId" name="clientId" className="input" defaultValue="">
              <option value="">— None —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">Create Job</button>
          </div>
        </form>
      </div>

      {/* Jobs list */}
      <h2 className="mb-4 text-lg font-semibold text-navy-900">All Jobs</h2>
      {jobs.length === 0 ? (
        <EmptyState>No jobs scheduled yet.</EmptyState>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <div key={job.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-navy-900">
                      {job.customerName}
                    </h3>
                    <JobStatusBadge status={job.status} />
                  </div>
                  <p className="mt-1 text-sm text-navy-600">{job.serviceNeeded}</p>
                  <p className="mt-1 text-xs text-navy-500">{job.address}</p>
                  <p className="mt-1 text-xs text-navy-500">
                    {fmtDate(job.scheduledDate)} · {job.scheduledTime} ·{" "}
                    {job.technician
                      ? `${job.technician.name} (${job.technician.role})`
                      : "Unassigned"}
                  </p>
                  {job.status === "CANCELLED" && job.cancelReason && (
                    <p className="mt-2 rounded bg-navy-50 px-3 py-2 text-xs text-navy-600">
                      Cancelled: {job.cancelReason}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  {job.status !== "CANCELLED" ? (
                    <form action={cancelJob}>
                      <input type="hidden" name="id" value={job.id} />
                      <ConfirmButton
                        message="Enter a reason for cancelling this job:"
                        promptReason
                      >
                        Cancel Job
                      </ConfirmButton>
                    </form>
                  ) : (
                    <form action={reinstateJob}>
                      <input type="hidden" name="id" value={job.id} />
                      <ConfirmButton
                        message="Reinstate this job to Scheduled?"
                        className="btn-outline btn-sm"
                      >
                        Reinstate
                      </ConfirmButton>
                    </form>
                  )}
                </div>
              </div>

              {/* Notes (internal, visible to admin + techs) */}
              {job.notes.length > 0 && (
                <div className="mt-4 border-t border-navy-100 pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400">
                    Technician Notes
                  </p>
                  <ul className="space-y-2">
                    {job.notes.map((n) => (
                      <li key={n.id} className="text-sm text-navy-700">
                        <span className="text-navy-900">{n.author.name}</span>{" "}
                        <span className="text-xs text-navy-400">
                          · {fmtDateTime(n.createdAt)}
                        </span>
                        <p className="whitespace-pre-wrap">{n.body}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
