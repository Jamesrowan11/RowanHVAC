import { prisma } from "@/lib/prisma";
import { assertRole } from "@/lib/session";
import { PageHeader, EmptyState, fmtDateTime } from "@/components/portal/ui";

export default async function ClientDocuments() {
  const user = await assertRole("CLIENT");

  // Scoped strictly to this client — never another client's records.
  const [payments, documents] = await Promise.all([
    prisma.paymentLink.findMany({
      where: { clientId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.document.findMany({
      where: { clientId: user.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Documents & Payments"
        subtitle="Payment links and documents shared with you by our team."
      />

      <h2 className="mb-3 text-lg font-semibold text-navy-900">Payments</h2>
      {payments.length === 0 ? (
        <EmptyState>No payment links yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <div key={p.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-navy-900">
                  {p.label || "Payment"}
                  {p.amount ? ` · ${p.amount}` : ""}
                </p>
                <p className="text-xs text-navy-400">{fmtDateTime(p.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`badge ${
                    p.status === "PAID"
                      ? "bg-green-100 text-green-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {p.status}
                </span>
                {p.status !== "PAID" && (
                  <a href={p.url} target="_blank" rel="noreferrer" className="btn-primary btn-sm">
                    Pay Now
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold text-navy-900">Documents</h2>
      {documents.length === 0 ? (
        <EmptyState>No documents have been shared with you yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {documents.map((d) => (
            <div key={d.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium text-navy-900">{d.originalName}</p>
                <p className="text-xs text-navy-400">
                  {(d.size / 1024).toFixed(0)} KB · {fmtDateTime(d.createdAt)}
                </p>
              </div>
              <a href={`/portal/documents/${d.id}`} className="btn-outline btn-sm" target="_blank">
                Download
              </a>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
