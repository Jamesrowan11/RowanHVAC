import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/queries";
import { PaymentStatusBadge } from "@/components/portal/StatusBadge";

export const metadata = { title: "Documents & Payments" };

export default async function ClientBilling() {
  const user = await requireRole("CLIENT");

  const [payments, documents] = await Promise.all([
    db.paymentLink.findMany({ where: { clientId: user.id }, orderBy: { createdAt: "desc" } }),
    db.document.findMany({ where: { clientId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-navy">Documents &amp; Payments</h1>

      <section className="card">
        <h2 className="font-bold text-navy">Payment links</h2>
        <ul className="mt-3 space-y-2">
          {payments.length === 0 && <li className="text-sm text-gray-500">No payment links right now.</li>}
          {payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy-50 p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-navy">{p.label ?? "Payment"}</p>
                <p className="text-xs text-gray-500">
                  Sent {fmtDateTime(p.createdAt)}{p.paidAt ? ` · paid ${fmtDateTime(p.paidAt)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <PaymentStatusBadge status={p.status} />
                {p.status === "SENT" && (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="btn-small">
                    Pay now
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="font-bold text-navy">Documents</h2>
        <p className="mt-1 text-xs text-gray-500">Invoices, proposals, and paperwork we&apos;ve shared with you.</p>
        <ul className="mt-3 space-y-2">
          {documents.length === 0 && <li className="text-sm text-gray-500">No documents yet.</li>}
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy-50 p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-navy">{d.fileName}</p>
                <p className="text-xs text-gray-500">{fmtDateTime(d.createdAt)} · {(d.size / 1024).toFixed(0)} KB</p>
              </div>
              <a href={`/api/files/${d.id}`} className="btn-small-outline shrink-0">Download</a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
