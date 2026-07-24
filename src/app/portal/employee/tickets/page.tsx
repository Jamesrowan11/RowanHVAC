import Link from "next/link";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/queries";
import { createTicketDraft } from "@/lib/actions/tickets";

export const metadata = { title: "Service Tickets" };
export const dynamic = "force-dynamic";

const billingLabel = { BILLABLE: "Billable", NO_CHARGE: "No charge", NEEDS_REVIEW: "Needs review" } as const;

export default async function EmployeeTickets() {
  const user = await requireRole("EMPLOYEE", "ADMIN");

  const tickets = await db.serviceTicket.findMany({
    where: { techId: user.id },
    orderBy: [{ status: "asc" }, { serviceDate: "desc" }],
    take: 100,
  });
  const drafts = tickets.filter((t) => t.status === "DRAFT");
  const submitted = tickets.filter((t) => t.status === "SUBMITTED");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">Service Tickets</h1>
        <form action={createTicketDraft}>
          <button type="submit" className="btn-primary">Start new ticket</button>
        </form>
      </div>

      <section className="card">
        <h2 className="font-bold text-navy">Drafts</h2>
        {drafts.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No drafts — start a new ticket above.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {drafts.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/portal/employee/tickets/${t.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy-50 p-3 text-sm transition hover:bg-navy-100"
                >
                  <div>
                    <p className="font-semibold text-navy">
                      #{t.ticketNumber} — {t.customerName || "(no customer yet)"}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">{fmtDateTime(t.serviceDate)} · {t.serviceAddress || "no address"}</p>
                  </div>
                  <span className="badge bg-amber-100 text-amber-900">Draft</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="font-bold text-navy">Submitted</h2>
        {submitted.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">Nothing submitted yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {submitted.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/portal/employee/tickets/${t.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy-50 p-3 text-sm transition hover:bg-navy-100"
                >
                  <div>
                    <p className="font-semibold text-navy">#{t.ticketNumber} — {t.customerName}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{fmtDateTime(t.serviceDate)} · {billingLabel[t.billingStatus]}</p>
                  </div>
                  <span className="whitespace-nowrap font-semibold text-navy">
                    {t.total != null ? `$${Number(t.total).toFixed(2)}` : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
