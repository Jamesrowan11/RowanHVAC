import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { assertRole } from "@/lib/session";
import { PageHeader, fmtDateTime } from "@/components/portal/ui";

export default async function AdminOverview() {
  await assertRole("ADMIN");

  const [openRequests, scheduled, inProgress, completed, recentRequests] =
    await Promise.all([
      prisma.request.count({ where: { status: { in: ["NEW", "REVIEWED"] } } }),
      prisma.job.count({ where: { status: "SCHEDULED" } }),
      prisma.job.count({ where: { status: "IN_PROGRESS" } }),
      prisma.job.count({ where: { status: "COMPLETED" } }),
      prisma.request.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

  const tiles = [
    { label: "Open Requests", value: openRequests, href: "/portal/admin/requests" },
    { label: "Scheduled", value: scheduled, href: "/portal/admin/schedule" },
    { label: "In Progress", value: inProgress, href: "/portal/admin/schedule" },
    { label: "Completed", value: completed, href: "/portal/admin/schedule" },
  ];

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="A snapshot of activity. Cancelled jobs are not counted as active."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="card p-5 transition hover:shadow-soft">
            <p className="text-sm text-navy-500">{t.label}</p>
            <p className="mt-2 text-3xl font-bold text-navy-900">{t.value}</p>
          </Link>
        ))}
      </div>

      <div className="card mt-6 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-navy-900">Latest Requests</h2>
          <Link href="/portal/admin/requests" className="text-sm text-accent hover:underline">
            View all →
          </Link>
        </div>
        {recentRequests.length === 0 ? (
          <p className="text-sm text-navy-500">No requests yet.</p>
        ) : (
          <ul className="divide-y divide-navy-100">
            {recentRequests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-navy-900">
                    {r.name} · {r.serviceNeeded}
                  </p>
                  <p className="truncate text-xs text-navy-500">
                    {r.phone} · {r.email}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-navy-400">
                  {fmtDateTime(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
