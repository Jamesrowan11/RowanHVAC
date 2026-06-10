import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/queries";
import { JobStatusBadge } from "@/components/portal/StatusBadge";

export const metadata = { title: "Service History" };

export default async function ClientHistory() {
  const user = await requireRole("CLIENT");

  // Strictly the client's own jobs — internal staff notes are never selected.
  const jobs = await db.job.findMany({
    where: { clientId: user.id },
    orderBy: { scheduledAt: "desc" },
    select: {
      id: true,
      service: true,
      scheduledAt: true,
      status: true,
      summary: true,
      address: true,
      cancelledAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">Service History</h1>
      {jobs.length === 0 && <p className="card text-sm text-gray-500">No service history yet.</p>}
      <div className="space-y-4">
        {jobs.map((j) => (
          <div key={j.id} className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-bold text-navy">{j.service}</h2>
                <p className="mt-0.5 text-sm text-gray-500">{fmtDateTime(j.scheduledAt)} · {j.address}</p>
              </div>
              <JobStatusBadge status={j.status} />
            </div>
            {j.status === "COMPLETED" && j.summary && (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-navy-50 p-3 text-sm text-gray-700">{j.summary}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
