import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PageHeader, EmptyState, fmtDate } from "@/components/portal/ui";
import { upsertMaintenancePolicy } from "../actions";

export default async function MaintenancePage() {
  await requireRole("ADMIN");
  const clients = await prisma.user.findMany({
    where: { role: "CLIENT" },
    orderBy: { name: "asc" },
    include: { maintenancePolicy: true },
  });

  return (
    <>
      <PageHeader
        title="Maintenance Policies"
        subtitle="Mark which clients have an active maintenance policy and set a renewal date."
      />

      {clients.length === 0 ? (
        <EmptyState>No client accounts yet.</EmptyState>
      ) : (
        <div className="space-y-3">
          {clients.map((c) => {
            const p = c.maintenancePolicy;
            return (
              <div key={c.id} className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-navy-900">{c.name}</h3>
                    <p className="text-sm text-navy-500">{c.email}</p>
                    <p className="mt-1 text-xs">
                      {p?.active ? (
                        <span className="badge bg-green-100 text-green-800">
                          Active policy
                          {p.renewalDate ? ` · renews ${fmtDate(p.renewalDate)}` : ""}
                        </span>
                      ) : (
                        <span className="badge bg-navy-100 text-navy-500">
                          No active policy
                        </span>
                      )}
                    </p>
                  </div>

                  <form
                    action={upsertMaintenancePolicy}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="clientId" value={c.id} />
                    <div>
                      <label className="label text-xs">Active</label>
                      <select
                        name="active"
                        className="input !w-auto py-1.5 text-xs"
                        defaultValue={p?.active ? "true" : "false"}
                      >
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </div>
                    <div>
                      <label className="label text-xs">Renewal date</label>
                      <input
                        type="date"
                        name="renewalDate"
                        className="input !w-auto py-1.5 text-xs"
                        defaultValue={
                          p?.renewalDate
                            ? new Date(p.renewalDate).toISOString().slice(0, 10)
                            : ""
                        }
                      />
                    </div>
                    <button type="submit" className="btn-navy btn-sm">Save</button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
