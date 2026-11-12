import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PageHeader } from "@/components/portal/ui";
import { updateJob } from "../../actions";

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("ADMIN");
  const { id } = await params;
  const [job, techs, clients] = await Promise.all([
    prisma.job.findUnique({ where: { id } }),
    prisma.user.findMany({
      where: { role: { in: ["EMPLOYEE", "ADMIN"] }, active: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, role: true },
    }),
    prisma.user.findMany({
      where: { role: "CLIENT", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);
  if (!job) notFound();
  // A job can still point at someone who has since been deactivated: keep them selectable.
  const missingTech = job.technicianId && !techs.some((t) => t.id === job.technicianId)
    ? await prisma.user.findUnique({ where: { id: job.technicianId }, select: { id: true, name: true, role: true } })
    : null;
  const allTechs = missingTech ? [...techs, missingTech] : techs;

  return (
    <>
      <Link href="/portal/admin/schedule" className="text-sm text-accent hover:underline">
        ← Back to scheduling
      </Link>
      <div className="mt-3">
        <PageHeader title="Edit Job" subtitle={`${job.customerName} · ${job.serviceNeeded}`} />
      </div>
      <div className="card p-6">
        <form action={updateJob} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="id" value={job.id} />
          <div>
            <label className="label" htmlFor="customerName">Customer name</label>
            <input id="customerName" name="customerName" className="input" required minLength={2} defaultValue={job.customerName} />
          </div>
          <div>
            <label className="label" htmlFor="address">Address</label>
            <input id="address" name="address" className="input" defaultValue={job.address} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="serviceNeeded">Service needed</label>
            <input id="serviceNeeded" name="serviceNeeded" className="input" required minLength={2} defaultValue={job.serviceNeeded} />
          </div>
          <div>
            <label className="label" htmlFor="scheduledDate">Date</label>
            <input
              id="scheduledDate"
              name="scheduledDate"
              type="date"
              className="input"
              required
              defaultValue={job.scheduledDate.toISOString().slice(0, 10)}
            />
          </div>
          <div>
            <label className="label" htmlFor="scheduledTime">Time</label>
            <input id="scheduledTime" name="scheduledTime" className="input" required defaultValue={job.scheduledTime || "—"} />
          </div>
          <div>
            <label className="label" htmlFor="technicianId">Technician</label>
            <select id="technicianId" name="technicianId" className="input" defaultValue={job.technicianId ?? ""}>
              <option value="">— Unassigned —</option>
              {allTechs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.role === "ADMIN" ? "Admin" : "Employee"})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="clientId">Customer account</label>
            <select id="clientId" name="clientId" className="input" defaultValue={job.clientId ?? ""}>
              <option value="">— None —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="status">Status</label>
            <select id="status" name="status" className="input" defaultValue={job.status}>
              <option value="SCHEDULED">Scheduled</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="cancelReason">Cancellation reason (if cancelled)</label>
            <input id="cancelReason" name="cancelReason" className="input" defaultValue={job.cancelReason ?? ""} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="summary">Work summary (the customer sees this in their service history)</label>
            <textarea id="summary" name="summary" rows={4} className="input" defaultValue={job.summary ?? ""} />
          </div>
          <div className="flex gap-3 sm:col-span-2">
            <button type="submit" className="btn-primary">Save Changes</button>
            <Link href="/portal/admin/schedule" className="btn-outline">Cancel</Link>
          </div>
        </form>
      </div>
    </>
  );
}
