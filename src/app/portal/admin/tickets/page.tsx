import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PageHeader, EmptyState } from "@/components/portal/ui";
import { TicketList } from "@/components/portal/TicketList";

export default async function TicketsPage() {
  await requireRole("ADMIN");
  const tickets = await prisma.serviceTicket.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      technician: { select: { name: true } },
      job: { select: { id: true, customerName: true } },
    },
  });
  return (
    <>
      <PageHeader
        title="Service Tickets & Maintenance Reports"
        subtitle="Written on the van terminals and checked by AI. Newest first (last 100)."
      />
      {tickets.length === 0 ? (
        <EmptyState>No service tickets yet. Technicians fill them in from a job on the van terminal.</EmptyState>
      ) : (
        <div className="card p-6">
          <TicketList tickets={tickets} showJob />
        </div>
      )}
    </>
  );
}
