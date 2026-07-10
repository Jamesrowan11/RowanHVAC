import Link from "next/link";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/queries";
import { createJob } from "@/lib/actions/jobs";
import { JobStatusBadge } from "@/components/portal/StatusBadge";
import ActionForm from "@/components/portal/ActionForm";
import { SERVICE_OPTIONS } from "@/lib/constants";

export const metadata = { title: "Schedule" };

export default async function AdminSchedule({
  searchParams,
}: {
  searchParams: Promise<{ fromRequest?: string }>;
}) {
  await requireRole("ADMIN");
  const { fromRequest } = await searchParams;

  const [technicians, clients, jobs, sourceRequest] = await Promise.all([
    // Assignable technicians: active employees AND admins.
    db.user.findMany({
      where: { active: true, role: { in: ["EMPLOYEE", "ADMIN"] } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    db.user.findMany({ where: { role: "CLIENT" }, orderBy: { name: "asc" } }),
    db.job.findMany({
      orderBy: { scheduledAt: "desc" },
      take: 100,
      include: { assignments: { include: { user: { select: { name: true } } } } },
    }),
    fromRequest
      ? db.quoteRequest.findUnique({ where: { id: fromRequest } })
      : Promise.resolve(null),
  ]);

  const employees = technicians.filter((t) => t.role === "EMPLOYEE");
  const admins = technicians.filter((t) => t.role === "ADMIN");
  const linkedClient = sourceRequest?.clientId
    ? clients.find((c) => c.id === sourceRequest.clientId)
    : undefined;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-navy">Scheduling</h1>

      <section className="card max-w-2xl">
        <h2 className="font-bold text-navy">
          {sourceRequest ? `Schedule job from request (${sourceRequest.name})` : "Create a job"}
        </h2>
        <ActionForm
          action={createJob}
          submitLabel="Create job"
          pendingLabel="Creating…"
          successMessage="Job created — assign a technician anytime from the job page."
          buttonClassName="btn-primary"
          className="mt-4 space-y-4"
        >
          {sourceRequest && <input type="hidden" name="requestId" value={sourceRequest.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="kind" className="label">Type</label>
              <select id="kind" name="kind" className="input" defaultValue="SERVICE">
                <option value="SERVICE">Service job</option>
                <option value="PICKUP">Pickup</option>
              </select>
            </div>
            <div>
              <label htmlFor="customerName" className="label">Customer name</label>
              <input
                id="customerName"
                name="customerName"
                required
                className="input"
                defaultValue={sourceRequest?.name ?? ""}
              />
            </div>
            <div>
              <label htmlFor="scheduledAt" className="label">Start date &amp; time</label>
              <input id="scheduledAt" name="scheduledAt" type="datetime-local" required className="input" />
            </div>
            <div>
              <label htmlFor="endAt" className="label">End time (optional)</label>
              <input id="endAt" name="endAt" type="datetime-local" className="input" />
            </div>
          </div>
          <div>
            <label htmlFor="address" className="label">Address</label>
            <input
              id="address"
              name="address"
              required
              className="input"
              defaultValue={linkedClient?.address ?? ""}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="service" className="label">Service needed</label>
              <select id="service" name="service" required className="input" defaultValue={sourceRequest?.service ?? ""}>
                <option value="" disabled>Select…</option>
                {[...new Set([...(sourceRequest?.service ? [sourceRequest.service] : []), ...SERVICE_OPTIONS])].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="technicianIds" className="label">Assign technicians (optional, any number)</label>
              <select id="technicianIds" name="technicianIds" multiple size={4} className="input">
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
              <p className="mt-1 text-xs text-gray-500">
                Cmd/Ctrl-click to select several, or none to assign later.
              </p>
            </div>
          </div>
          <div>
            <label htmlFor="clientId" className="label">Link to portal client (optional)</label>
            <select id="clientId" name="clientId" className="input" defaultValue={sourceRequest?.clientId ?? ""}>
              <option value="">— No portal account —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email}){c.active ? "" : " — deactivated"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="quotedPrice" className="label">Quoted price ($, optional)</label>
            <input id="quotedPrice" name="quotedPrice" type="number" step="0.01" min="0" className="input" />
            <p className="mt-1 text-xs text-gray-500">
              When set (and a portal client is linked), the customer is automatically
              emailed/texted a link to accept the price — due one day before the appointment.
            </p>
          </div>
        </ActionForm>
      </section>

      <section>
        <h2 className="text-lg font-bold text-navy">All Jobs</h2>
        <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Technician</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jobs.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-gray-500">No jobs yet.</td></tr>
              )}
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-navy-50/50">
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDateTime(j.scheduledAt)}</td>
                  <td className="px-4 py-3 font-medium text-navy">{j.customerName}</td>
                  <td className="px-4 py-3">{j.service}</td>
                  <td className="px-4 py-3">
                    {j.assignments.length > 0 ? (
                      j.assignments.map((a) => a.user.name).join(", ")
                    ) : (
                      <span className="italic text-gray-400">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><JobStatusBadge status={j.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/portal/admin/jobs/${j.id}`} className="font-medium text-accent-600 hover:underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
