import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { adminAdjustTicket, reopenTicket, deleteTicketDraft } from "@/lib/actions/tickets";
import TicketSummary from "@/components/portal/TicketSummary";
import ActionForm from "@/components/portal/ActionForm";
import ConfirmForm from "@/components/portal/ConfirmForm";

export const metadata = { title: "Ticket Review" };
export const dynamic = "force-dynamic";

export default async function AdminTicketDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("ADMIN");
  const { id } = await params;

  const ticket = await db.serviceTicket.findUnique({
    where: { id },
    include: {
      tech: { select: { name: true } },
      client: { select: { name: true, customerNumber: true } },
      lineItems: { orderBy: { createdAt: "asc" } },
      photos: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">
          Ticket #{ticket.ticketNumber} — {ticket.customerName || "draft"}
        </h1>
        <Link href="/portal/admin/tickets" className="text-sm font-medium text-accent-600 hover:underline">
          ← All tickets
        </Link>
      </div>

      <TicketSummary ticket={ticket} />

      <section className="card max-w-2xl">
        <h2 className="font-bold text-navy">Admin review</h2>
        <p className="mt-1 text-xs text-gray-500">
          Techs can&apos;t change a submitted ticket&apos;s price — adjustments happen here.
        </p>

        <ActionForm
          action={adminAdjustTicket}
          submitLabel="Save adjustment"
          successMessage="Saved."
          resetOnSuccess={false}
          className="mt-3 grid gap-3 sm:grid-cols-2"
        >
          <input type="hidden" name="ticketId" value={ticket.id} />
          <div>
            <label htmlFor="billingStatus" className="label">Billing status</label>
            <select id="billingStatus" name="billingStatus" className="input" defaultValue={ticket.billingStatus}>
              <option value="BILLABLE">Billable</option>
              <option value="NO_CHARGE">No charge</option>
              <option value="NEEDS_REVIEW">Needs review</option>
            </select>
          </div>
          <div>
            <label htmlFor="total" className="label">Total ($)</label>
            <input
              id="total"
              name="total"
              type="number"
              step="0.01"
              defaultValue={ticket.total != null ? Number(ticket.total) : ""}
              placeholder="unpriced"
              className="input"
            />
          </div>
        </ActionForm>

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-gray-100 pt-4 text-sm">
          {ticket.status === "SUBMITTED" && (
            <ConfirmForm
              action={reopenTicket}
              confirmText="Send this ticket back to the tech as a draft? Its computed price stays until they resubmit."
            >
              <input type="hidden" name="ticketId" value={ticket.id} />
              <button type="submit" className="font-medium text-accent-600 hover:underline">Reopen as draft</button>
            </ConfirmForm>
          )}
          <ConfirmForm
            action={deleteTicketDraft}
            confirmText={`Permanently delete ticket #${ticket.ticketNumber} and its photos? This can't be undone.`}
          >
            <input type="hidden" name="ticketId" value={ticket.id} />
            <button type="submit" className="font-medium text-red-600 hover:underline">Delete ticket</button>
          </ConfirmForm>
        </div>
      </section>
    </div>
  );
}
