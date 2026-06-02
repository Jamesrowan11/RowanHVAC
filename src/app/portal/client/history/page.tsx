import { prisma } from "@/lib/prisma";
import { assertRole } from "@/lib/session";
import {
  PageHeader,
  JobStatusBadge,
  EmptyState,
  fmtDate,
} from "@/components/portal/ui";

export default async function ClientHistory() {
  const user = await assertRole("CLIENT");

  // Past / completed / cancelled jobs for this client only.
  const jobs = await prisma.job.findMany({
    where: { clientId: user.id },
    orderBy: { scheduledDate: "desc" },
  });

  return (
    <>
      <PageHeader
        title="Service History"
        subtitle="A record of your past appointments and work performed."
      />
      {jobs.length === 0 ? (
        <EmptyState>No service history yet.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-navy-100">
          <table className="min-w-full divide-y divide-navy-100 text-sm">
            <thead className="bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100 bg-white">
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-navy-700">
                    {fmtDate(j.scheduledDate)}
                  </td>
                  <td className="px-4 py-3 font-medium text-navy-900">
                    {j.serviceNeeded}
                  </td>
                  <td className="px-4 py-3">
                    <JobStatusBadge status={j.status} />
                  </td>
                  <td className="px-4 py-3 text-navy-600">
                    {j.status === "CANCELLED"
                      ? "Cancelled"
                      : j.summary || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
