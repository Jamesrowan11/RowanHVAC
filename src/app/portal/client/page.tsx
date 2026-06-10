import Link from "next/link";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime } from "@/lib/queries";
import { JobStatusBadge } from "@/components/portal/StatusBadge";
import { COMPANY } from "@/lib/constants";

export const metadata = { title: "My Appointments" };

export default async function ClientDashboard() {
  const user = await requireRole("CLIENT");

  const now = new Date();
  const [upcoming, past] = await Promise.all([
    db.job.findMany({
      where: { clientId: user.id, scheduledAt: { gte: now }, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      orderBy: { scheduledAt: "asc" },
    }),
    db.job.findMany({
      where: {
        clientId: user.id,
        OR: [{ scheduledAt: { lt: now } }, { status: { in: ["COMPLETED", "CANCELLED"] } }],
      },
      orderBy: { scheduledAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">Welcome, {user.name.split(" ")[0]}</h1>
        <Link href="/portal/client/request" className="btn-primary">New Service Request</Link>
      </div>

      <section className={`card border-l-4 ${user.policyActive ? "border-green-500" : "border-navy-200"}`}>
        <h2 className="font-bold text-navy">Maintenance Plan</h2>
        {user.policyActive ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-700">
              Your maintenance policy is <span className="font-semibold text-green-700">active</span>
              {user.policyRenewal && <> — renews {fmtDate(user.policyRenewal)}</>}.
            </p>
            <Link href="/portal/client/request?maintenance=1" className="btn-small">
              Schedule Maintenance
            </Link>
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-700">
            You don&apos;t have an active maintenance policy. Call us at{" "}
            <a href={COMPANY.phoneHref} className="font-medium text-accent-600">{COMPANY.phone}</a>{" "}
            to learn about our service agreements — seasonal tune-ups and priority scheduling.
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="font-bold text-navy">Upcoming appointments</h2>
        <ul className="mt-3 space-y-2">
          {upcoming.length === 0 && <li className="text-sm text-gray-500">No upcoming appointments.</li>}
          {upcoming.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy-50 p-3 text-sm">
              <div>
                <p className="font-semibold text-navy">{j.service}</p>
                <p className="mt-0.5 text-xs text-gray-500">{fmtDateTime(j.scheduledAt)} · {j.address}</p>
              </div>
              <JobStatusBadge status={j.status} />
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-navy">Recent appointments</h2>
          <Link href="/portal/client/history" className="text-sm font-medium text-accent-600 hover:underline">
            Full history
          </Link>
        </div>
        <ul className="mt-3 space-y-2">
          {past.length === 0 && <li className="text-sm text-gray-500">No past appointments.</li>}
          {past.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy-50 p-3 text-sm">
              <div>
                <p className="font-semibold text-navy">{j.service}</p>
                <p className="mt-0.5 text-xs text-gray-500">{fmtDateTime(j.scheduledAt)}</p>
              </div>
              <JobStatusBadge status={j.status} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
