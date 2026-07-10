import { fmtDateTime } from "@/lib/queries";
import type { Attachment, ServiceTicket, TicketLineItem, User } from "@prisma/client";

type TicketFull = ServiceTicket & {
  tech: Pick<User, "name">;
  client: Pick<User, "name" | "customerNumber"> | null;
  lineItems: TicketLineItem[];
  photos: Attachment[];
};

const money = (n: unknown) => (n == null ? "—" : `$${Number(n).toFixed(2)}`);

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <dt className="font-medium text-gray-500">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

/** Read-only rendering of a submitted (or in-review) service ticket. */
export default function TicketSummary({ ticket }: { ticket: TicketFull }) {
  const readings: [string, string | null][] = [
    ["Capacitor rated", ticket.capRated],
    ["Capacitor tested", ticket.capTested],
    ["Suction PSI before", ticket.suctionBefore],
    ["Suction PSI after", ticket.suctionAfter],
    ["Liquid PSI before", ticket.liquidBefore],
    ["Liquid PSI after", ticket.liquidAfter],
    ["Superheat", ticket.superheat],
    ["Subcooling", ticket.subcooling],
    ["Compressor amps", ticket.compressorAmps],
    ["Fan motor amps", ticket.fanAmps],
    ["Supply air temp", ticket.supplyAirTemp],
    ["Refrigerant added", ticket.refrigerantType ? `${ticket.refrigerantType}${ticket.refrigerantLbs ? ` · ${Number(ticket.refrigerantLbs)} lb` : ""}` : null],
  ];
  const filledReadings = readings.filter(([, v]) => v);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card">
        <h2 className="font-bold text-navy">Ticket #{ticket.ticketNumber}</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <Row label="Customer" value={`${ticket.customerName}${ticket.client?.customerNumber ? ` · #${ticket.client.customerNumber}` : ""}`} />
          <Row label="Service address" value={ticket.serviceAddress} />
          <Row label="Service date" value={fmtDateTime(ticket.serviceDate)} />
          <Row label="Technician" value={ticket.tech.name} />
          <Row label="Time" value={ticket.timeIn && ticket.timeOut ? `${fmtDateTime(ticket.timeIn)} → ${fmtDateTime(ticket.timeOut)}` : null} />
          <Row label="Zone" value={ticket.zone} />
          <Row label="Technicians on job" value={String(ticket.techCount)} />
          <Row label="Ladder used" value={ticket.ladderUsed ? "Yes" : null} />
          <Row label="Maintenance visit" value={ticket.maintenanceVisit ? "Yes" : null} />
          <Row
            label="Equipment"
            value={[ticket.systemType, ticket.brand, ticket.modelNumber && `Model ${ticket.modelNumber}`, ticket.serialNumber && `Serial ${ticket.serialNumber}`, ticket.ageYears != null && `${ticket.ageYears} yrs old`].filter(Boolean).join(" · ") || null}
          />
        </dl>

        {filledReadings.length > 0 && (
          <>
            <h3 className="mt-5 text-sm font-bold text-navy">Readings</h3>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              {filledReadings.map(([label, v]) => (
                <div key={label}>
                  <dt className="text-xs font-medium text-gray-500">{label}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        {ticket.readingsNotes && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{ticket.readingsNotes}</p>}

        <h3 className="mt-5 text-sm font-bold text-navy">Work performed</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{ticket.workPerformed || "—"}</p>
      </section>

      <section className="card">
        <h2 className="font-bold text-navy">Billing</h2>
        <p className="mt-1 text-sm">
          <span className={`badge ${ticket.billingStatus === "BILLABLE" ? "bg-green-100 text-green-800" : ticket.billingStatus === "NO_CHARGE" ? "bg-navy-100 text-navy-800" : "bg-amber-100 text-amber-900"}`}>
            {ticket.billingStatus === "BILLABLE" ? "Billable" : ticket.billingStatus === "NO_CHARGE" ? "No charge" : "Needs review"}
          </span>
          {ticket.needsManualPricing && (
            <span className="badge ml-2 bg-red-100 text-red-700">Manual pricing needed</span>
          )}
          {ticket.exportedAt && (
            <span className="badge ml-2 bg-navy-100 text-navy-800">Exported {fmtDateTime(ticket.exportedAt)}</span>
          )}
        </p>
        <ul className="mt-3 divide-y divide-gray-100 rounded-lg bg-navy-50 p-3 text-sm">
          {ticket.lineItems.length === 0 && <li className="py-1 text-gray-500">No line items.</li>}
          {ticket.lineItems.map((l) => (
            <li key={l.id} className="flex justify-between gap-3 py-1.5">
              <span>{l.qty && Number(l.qty) !== 1 ? `${Number(l.qty)} × ` : ""}{l.label}</span>
              <span className="whitespace-nowrap font-medium text-navy">{money(l.amount)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-3 py-2 text-base font-bold text-navy">
            <span>Total</span>
            <span>{money(ticket.total)}</span>
          </li>
        </ul>

        {ticket.photos.length > 0 && (
          <>
            <h3 className="mt-5 text-sm font-bold text-navy">Photos ({ticket.photos.length})</h3>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {ticket.photos.map((p) => (
                <a key={p.id} href={`/api/attachments/${p.id}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/attachments/${p.id}`} alt={p.fileName} className="h-24 w-full rounded-lg object-cover" />
                </a>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
