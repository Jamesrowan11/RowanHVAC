import Link from "next/link";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/queries";
import { JobStatusBadge } from "@/components/portal/StatusBadge";

export const metadata = { title: "Admin Overview" };

export default async function AdminOverview() {
  await requireRole("ADMIN");

  const [openRequests, scheduled, inProgress, completed, recentJobs, recentRequests] =
    await Promise.all([
      db.quoteRequest.count({ where: { status: "NEW" } }),
      db.job.count({ where: { status: "SCHEDULED" } }),
      db.job.count({ where: { status: "IN_PROGRESS" } }),
      db.job.count({ where: { status: "COMPLETED" } }),
      db.job.findMany({
        orderBy: { scheduledAt: "desc" },
        take: 6,
        include: { technician: { select: { name: true } } },
      }),
      db.quoteRequest.findMany({ where: { status: "NEW" }, orderBy: { createdAt: "desc" }, take: 5 }),
    ]);

  const tiles = [
    { label: "Open Requests", value: openRequests, href: "/portal/admin/requests", accent: true },
    { label: "Scheduled", value: scheduled, href: "/portal/admin/schedule" },
    { label: "In Progress", value: inProgress, href: "/portal/admin/schedule" },
    { label: "Completed", value: completed, href: "/portal/admin/schedule" },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-navy">Overview</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="card transition hover:-translate-y-0.5 hover:shadow-lg">
            <p className={`text-3xl font-extrabold ${t.accent ? "text-accent-600" : "text-navy"}`}>{t.value}</p>
            <p className="mt-1 text-sm font-medium text-gray-600">{t.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-navy">New Requests</h2>
            <Link href="/portal/admin/requests" className="text-sm font-medium text-accent-600 hover:underline">
              View all
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-gray-100">
            {recentRequests.length === 0 && <li className="py-3 text-sm text-gray-500">No open requests.</li>}
            {recentRequests.map((r) => (
              <li key={r.id} className="py-3 text-sm">
                <p className="font-semibold text-navy">{r.name} · {r.service}</p>
                <p className="mt-0.5 text-gray-500">{fmtDateTime(r.createdAt)} · {r.phone}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-navy">Recent Jobs</h2>
            <Link href="/portal/admin/schedule" className="text-sm font-medium text-accent-600 hover:underline">
              Full schedule
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-gray-100">
            {recentJobs.length === 0 && <li className="py-3 text-sm text-gray-500">No jobs yet.</li>}
            {recentJobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <Link href={`/portal/admin/jobs/${j.id}`} className="font-semibold text-navy hover:underline">
                    {j.customerName} · {j.service}
                  </Link>
                  <p className="mt-0.5 text-gray-500">
                    {fmtDateTime(j.scheduledAt)} · {j.technician.name}
                  </p>
                </div>
                <JobStatusBadge status={j.status} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
