import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { computeTicketPricing } from "@/lib/pricing";
import { deleteTicketDraft } from "@/lib/actions/tickets";
import TicketWizard from "@/components/portal/TicketWizard";
import TicketSummary from "@/components/portal/TicketSummary";
import ConfirmForm from "@/components/portal/ConfirmForm";

export const metadata = { title: "Service Ticket" };
export const dynamic = "force-dynamic";

/** Format a Date as a datetime-local / date input value in server-local time. */
const dtLocal = (d: Date | null) =>
  d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("EMPLOYEE", "ADMIN");
  const { id } = await params;

  const ticket = await db.serviceTicket.findFirst({
    where: user.role === "ADMIN" ? { id } : { id, techId: user.id },
    include: {
      tech: { select: { name: true } },
      client: { select: { name: true, customerNumber: true } },
      lineItems: { orderBy: { createdAt: "asc" } },
      photos: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) notFound();

  if (ticket.status === "SUBMITTED") {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-navy">Ticket #{ticket.ticketNumber} — submitted</h1>
          <Link href="/portal/employee/tickets" className="text-sm font-medium text-accent-600 hover:underline">
            ← All tickets
          </Link>
        </div>
        <TicketSummary ticket={ticket} />
      </div>
    );
  }

  const [clients, parts, rateZones, pricing] = await Promise.all([
    db.user.findMany({
      where: { role: "CLIENT", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, customerNumber: true, address: true },
    }),
    db.priceBookItem.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.laborRate.findMany({ distinct: ["zone"], select: { zone: true }, orderBy: { zone: "asc" } }),
    computeTicketPricing(ticket),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">Ticket #{ticket.ticketNumber}</h1>
        <div className="flex items-center gap-4">
          <ConfirmForm action={deleteTicketDraft} confirmText="Delete this draft ticket and its photos? This can't be undone.">
            <input type="hidden" name="ticketId" value={ticket.id} />
            <button type="submit" className="text-sm font-medium text-red-600 hover:underline">Delete draft</button>
          </ConfirmForm>
          <Link href="/portal/employee/tickets" className="text-sm font-medium text-accent-600 hover:underline">
            ← All tickets
          </Link>
        </div>
      </div>

      <TicketWizard
        ticket={{
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          clientId: ticket.clientId,
          customerName: ticket.customerName,
          serviceAddress: ticket.serviceAddress,
          serviceDate: dtLocal(ticket.serviceDate).slice(0, 10),
          timeIn: dtLocal(ticket.timeIn),
          timeOut: dtLocal(ticket.timeOut),
          zone: ticket.zone,
          techCount: ticket.techCount,
          ladderUsed: ticket.ladderUsed,
          maintenanceVisit: ticket.maintenanceVisit,
          systemType: ticket.systemType,
          brand: ticket.brand,
          modelNumber: ticket.modelNumber,
          serialNumber: ticket.serialNumber,
          ageYears: ticket.ageYears,
          capRated: ticket.capRated,
          capTested: ticket.capTested,
          suctionBefore: ticket.suctionBefore,
          suctionAfter: ticket.suctionAfter,
          liquidBefore: ticket.liquidBefore,
          liquidAfter: ticket.liquidAfter,
          superheat: ticket.superheat,
          subcooling: ticket.subcooling,
          compressorAmps: ticket.compressorAmps,
          fanAmps: ticket.fanAmps,
          supplyAirTemp: ticket.supplyAirTemp,
          refrigerantType: ticket.refrigerantType,
          refrigerantLbs: ticket.refrigerantLbs ? Number(ticket.refrigerantLbs) : null,
          readingsNotes: ticket.readingsNotes,
          workPerformed: ticket.workPerformed,
          billingStatus: ticket.billingStatus,
        }}
        clients={clients}
        parts={parts.map((p) => ({
          id: p.id, name: p.name, partNumber: p.partNumber, unit: p.unit, unitPrice: Number(p.unitPrice),
        }))}
        partLines={ticket.lineItems
          .filter((l) => l.kind === "PART")
          .map((l) => ({ id: l.id, label: l.label, qty: l.qty ? Number(l.qty) : null, amount: Number(l.amount) }))}
        photos={ticket.photos.map((p) => ({ id: p.id, fileName: p.fileName }))}
        zones={rateZones.map((z) => z.zone)}
        pricing={pricing}
      />
    </div>
  );
}
