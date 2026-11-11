import type { ServiceTicket } from "@prisma/client";
import type { TicketData } from "@/lib/ticket";
import { renderTicketPdf } from "@/lib/ticketPdf";

export function ticketPdfName(invoiceNumber: string): string {
  return `Rowan-Service-Ticket-${invoiceNumber.replace(/[^A-Za-z0-9-]/g, "") || "ticket"}.pdf`;
}

/** Streams a ticket as a PDF (inline to view, or as a download). */
export async function ticketPdfResponse(
  ticket: Pick<ServiceTicket, "invoiceNumber" | "data">,
  download: boolean,
): Promise<Response> {
  const bytes = await renderTicketPdf((ticket.data ?? {}) as TicketData);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${ticketPdfName(ticket.invoiceNumber)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
