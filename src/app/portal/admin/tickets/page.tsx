import Link from "next/link";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/queries";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Service Tickets" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "", label: "All" },
  { key: "drafts", label: "Drafts" },
  { key: "billable", label: "Billable" },
  { key: "no-charge", label: "No charge" },
  { key: "needs-review", label: "Needs review" },
  { key: "unexported", label: "Not yet exported" },
] as const;

export default async function AdminTickets({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; date?: string }>;
}) {
  await requireRole("ADMIN");
  const { filter = "", date = "" } = await searchParams;

  const where: Prisma.ServiceTicketWhereInput = {};
  if (filter === "drafts") where.status = "DRAFT";
  else if (filter === "billable") { where.status = "SUBMITTED"; where.billingStatus = "BILLABLE"; }
  else if (filter === "no-charge") { where.status = "SUBMITTED"; where.billingStatus = "NO_CHARGE"; }
  else if (filter === "needs-review") {
    where.status = "SUBMITTED";
    where.OR = [{ billingStatus: "NEEDS_REVIEW" }, { needsManualPricing: true }];
  } else if (filter === "unexported") {
    where.status = "SUBMITTED";
    where.exportedAt = null;
  }
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    where.serviceDate = { gte: start, lt: end };
  }

  const tickets = await db.serviceTicket.findMany({
    where,
    orderBy: { serviceDate: "desc" },
    take: 200,
    include: { tech: { select: { name: true } }, client: { select: { customerNumber: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">Service Tickets</h1>
        <Link href="/portal/admin/tickets/export" className="btn-primary">QuickBooks export</Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/portal/admin/tickets?filter=${f.key}${date ? `&date=${date}` : ""}`}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              filter === f.key ? "bg-navy text-white" : "bg-navy-100 text-navy-700 hover:bg-navy-200"
            }`}
          >
            {f.label}
          </Link>
        ))}
        <form className="ml-auto flex items-center gap-2" action="/portal/admin/tickets">
          {filter && <input type="hidden" name="filter" value={filter} />}
          <input type="date" name="date" defaultValue={date} className="input !w-auto" aria-label="Filter by service date" />
          <button type="submit" className="btn-small-outline">Go</button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Tech</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tickets.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-gray-500">No tickets match.</td></tr>
            )}
            {tickets.map((t) => (
              <tr key={t.id} className="hover:bg-navy-50/50">
                <td className="px-4 py-3 font-medium text-navy">#{t.ticketNumber}</td>
                <td className="whitespace-nowrap px-4 py-3">{fmtDateTime(t.serviceDate)}</td>
                <td className="px-4 py-3">
                  {t.customerName || <span className="italic text-gray-400">—</span>}
                  {t.client?.customerNumber ? <span className="text-gray-400"> · #{t.client.customerNumber}</span> : null}
                </td>
                <td className="px-4 py-3">{t.tech.name}</td>
                <td className="px-4 py-3">
                  {t.status === "DRAFT" ? (
                    <span className="badge bg-amber-100 text-amber-900">Draft</span>
                  ) : t.billingStatus === "NO_CHARGE" ? (
                    <span className="badge bg-navy-100 text-navy-800">No charge</span>
                  ) : t.billingStatus === "NEEDS_REVIEW" || t.needsManualPricing ? (
                    <span className="badge bg-red-100 text-red-700">Needs review</span>
                  ) : t.exportedAt ? (
                    <span className="badge bg-green-100 text-green-800">Exported</span>
                  ) : (
                    <span className="badge bg-green-100 text-green-800">Billable</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-navy">
                  {t.total != null ? `$${Number(t.total).toFixed(2)}` : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={t.status === "DRAFT" ? `/portal/employee/tickets/${t.id}` : `/portal/admin/tickets/${t.id}`}
                    className="font-medium text-accent-600 hover:underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
