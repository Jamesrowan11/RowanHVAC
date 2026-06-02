import { prisma } from "@/lib/prisma";
import { assertRole } from "@/lib/session";
import { PageHeader, EmptyState, fmtDateTime } from "@/components/portal/ui";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import {
  createPaymentLink,
  markPaymentPaid,
  deletePaymentLink,
  uploadDocument,
  deleteDocument,
} from "../actions";

export default async function PaymentsPage() {
  await assertRole("ADMIN");
  const clients = await prisma.user.findMany({
    where: { role: "CLIENT" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
  const [payments, documents] = await Promise.all([
    prisma.paymentLink.findMany({
      orderBy: { createdAt: "desc" },
      include: { client: { select: { name: true } } },
    }),
    prisma.document.findMany({
      orderBy: { createdAt: "desc" },
      include: { client: { select: { name: true } } },
    }),
  ]);

  const clientOptions = clients.map((c) => (
    <option key={c.id} value={c.id}>
      {c.name} ({c.email})
    </option>
  ));

  return (
    <>
      <PageHeader
        title="Payments & Documents"
        subtitle="Share payment links and documents with clients. Clients can view and download these in their portal."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Payment link */}
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-semibold text-navy-900">Send a payment link</h2>
          <form action={createPaymentLink} className="space-y-3">
            <div>
              <label className="label">Client</label>
              <select name="clientId" className="input" required defaultValue="">
                <option value="" disabled>Choose a client…</option>
                {clientOptions}
              </select>
            </div>
            <div>
              <label className="label">Payment URL</label>
              <input name="url" type="url" className="input" placeholder="https://…" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Label</label>
                <input name="label" className="input" placeholder="e.g. Invoice #1024" />
              </div>
              <div>
                <label className="label">Amount</label>
                <input name="amount" className="input" placeholder="e.g. $249.00" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-navy-700">
              <input type="checkbox" name="notify" defaultChecked className="rounded border-navy-300" />
              Email the client about this link
            </label>
            <button type="submit" className="btn-primary">Send Link</button>
          </form>
        </div>

        {/* Upload document */}
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-semibold text-navy-900">Upload a document</h2>
          <form action={uploadDocument} className="space-y-3" encType="multipart/form-data">
            <div>
              <label className="label">Client</label>
              <select name="clientId" className="input" required defaultValue="">
                <option value="" disabled>Choose a client…</option>
                {clientOptions}
              </select>
            </div>
            <div>
              <label className="label">File (PDF or image, max 10MB)</label>
              <input
                name="file"
                type="file"
                accept="application/pdf,image/*"
                className="input"
                required
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-navy-700">
              <input type="checkbox" name="notify" defaultChecked className="rounded border-navy-300" />
              Email the client about this document
            </label>
            <button type="submit" className="btn-primary">Upload</button>
          </form>
        </div>
      </div>

      {/* Payment links list */}
      <h2 className="mb-3 mt-8 text-lg font-semibold text-navy-900">Payment Links</h2>
      {payments.length === 0 ? (
        <EmptyState>No payment links yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <div key={p.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-medium text-navy-900">
                  {p.client.name}
                  {p.label ? ` · ${p.label}` : ""}
                  {p.amount ? ` · ${p.amount}` : ""}
                </p>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-xs text-accent hover:underline"
                >
                  {p.url}
                </a>
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
                  <form action={markPaymentPaid}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="btn-outline btn-sm">Mark Paid</button>
                  </form>
                )}
                <form action={deletePaymentLink}>
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmButton message="Delete this payment link?">Delete</ConfirmButton>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Documents list */}
      <h2 className="mb-3 mt-8 text-lg font-semibold text-navy-900">Documents</h2>
      {documents.length === 0 ? (
        <EmptyState>No documents uploaded yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {documents.map((d) => (
            <div key={d.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium text-navy-900">{d.originalName}</p>
                <p className="text-xs text-navy-400">
                  {d.client.name} · {(d.size / 1024).toFixed(0)} KB · {fmtDateTime(d.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a href={`/portal/documents/${d.id}`} className="btn-outline btn-sm" target="_blank">
                  Download
                </a>
                <form action={deleteDocument}>
                  <input type="hidden" name="id" value={d.id} />
                  <ConfirmButton message="Delete this document?">Delete</ConfirmButton>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
