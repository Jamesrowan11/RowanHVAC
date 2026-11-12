import type { ServiceTicket } from "@prisma/client";
import { sheetKind, type TicketData } from "@/lib/ticket";
import { renderTicketPdf } from "@/lib/ticketPdf";

export function ticketPdfName(invoiceNumber: string, kind: string = "service"): string {
  const what = sheetKind(kind) === "maintenance" ? "Maintenance-Report" : "Service-Ticket";
  return `Rowan-${what}-${invoiceNumber.replace(/[^A-Za-z0-9-]/g, "") || "ticket"}.pdf`;
}

/** Streams a ticket as a PDF (inline to view, or as a download). */
export async function ticketPdfResponse(
  ticket: Pick<ServiceTicket, "invoiceNumber" | "data" | "kind">,
  download: boolean,
): Promise<Response> {
  const bytes = await renderTicketPdf((ticket.data ?? {}) as TicketData, { kind: sheetKind(ticket.kind) });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${ticketPdfName(ticket.invoiceNumber, ticket.kind)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
