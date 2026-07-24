import Link from "next/link";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/queries";
import { updateQbAccounts } from "@/lib/actions/pricebook";
import ActionForm from "@/components/portal/ActionForm";

export const metadata = { title: "QuickBooks Export" };
export const dynamic = "force-dynamic";

/** Local YYYY-MM-DD for "today" (server runs in company-local time). */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function QuickBooksExport({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; includeNeedsReview?: string }>;
}) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayStr();
  const includeNeedsReview = sp.includeNeedsReview === "1";

  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start); end.setDate(end.getDate() + 1);

  const [tickets, qbSettings] = await Promise.all([
    db.serviceTicket.findMany({
      where: { status: "SUBMITTED", serviceDate: { gte: start, lt: end } },
      orderBy: { ticketNumber: "asc" },
      include: { client: { select: { customerNumber: true } }, tech: { select: { name: true } } },
    }),
    db.setting.findMany({ where: { key: { in: ["qb.arAccount", "qb.incomeAccount"] } } }),
  ]);
  const arAccount = qbSettings.find((s) => s.key === "qb.arAccount")?.value || "Accounts Receivable";
  const incomeAccount = qbSettings.find((s) => s.key === "qb.incomeAccount")?.value || "Sales";

  const exportable = tickets.filter(
    (t) => t.billingStatus === "BILLABLE" || (includeNeedsReview && t.billingStatus === "NEEDS_REVIEW")
  );
  const qs = `date=${date}${includeNeedsReview ? "&includeNeedsReview=1" : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">QuickBooks Export</h1>
        <Link href="/portal/admin/tickets" className="text-sm font-medium text-accent-600 hover:underline">
          ← All tickets
        </Link>
      </div>

      <section className="card max-w-2xl">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="date" className="label">Day to export</label>
            <input id="date" name="date" type="date" defaultValue={date} className="input" />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-gray-700">
            <input type="checkbox" name="includeNeedsReview" value="1" defaultChecked={includeNeedsReview} className="h-4 w-4" />
            Include &ldquo;Needs review&rdquo; tickets
          </label>
          <button type="submit" className="btn-small-outline">Show day</button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
          <a href={`/api/export/quickbooks?${qs}&format=iif`} className="btn-primary" download>
            Download IIF ({exportable.length} ticket{exportable.length === 1 ? "" : "s"})
          </a>
          <a href={`/api/export/quickbooks?${qs}&format=csv`} className="btn-secondary" download>
            Download CSV
          </a>
          <a href={`/api/export/quickbooks?${qs}&format=iif&sample=1`} className="btn-small-outline self-center" download>
            Sample (1 record)
          </a>
        </div>
        <div className="mt-4 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-bold text-navy">QuickBooks account names</h3>
          <p className="mt-1 text-xs text-gray-500">
            These must match your QuickBooks company file <strong>exactly</strong> or the import
            fails with &ldquo;The Account does not exist in Quickbooks.&rdquo; Find the exact names in
            QuickBooks under <strong>Lists → Chart of Accounts</strong> — the receivables account,
            and the income account you invoice services to.
          </p>
          <ActionForm
            action={updateQbAccounts}
            submitLabel="Save account names"
            successMessage="Saved — re-download the file and import again."
            resetOnSuccess={false}
            className="mt-2 grid gap-2 sm:grid-cols-2"
          >
            <div>
              <label htmlFor="arAccount" className="label">Receivables account</label>
              <input id="arAccount" name="arAccount" required defaultValue={arAccount} className="input" />
            </div>
            <div>
              <label htmlFor="incomeAccount" className="label">Income account</label>
              <input id="incomeAccount" name="incomeAccount" required defaultValue={incomeAccount} className="input" />
            </div>
          </ActionForm>
        </div>
        <p className="mt-3 text-xs text-amber-900">
          ⚠ Before the first real batch: download the <strong>Sample</strong> file and test-import it into
          QuickBooks Desktop (File → Utilities → Import → IIF Files) to confirm the account names above match.
        </p>
        <p className="mt-2 text-xs text-amber-900">
          Customer matching: QuickBooks matches customers by their exact list name, so the export sends the
          customer&apos;s name exactly as it appears on the ticket — make sure it matches the QuickBooks
          customer list spelling. The service address rides along as the invoice&apos;s bill-to block and the
          customer number goes in the memo, so you can always confirm it landed on the right person.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          No-charge tickets are never exported. Downloading marks tickets as exported (shown below) so
          double-imports are easy to spot — re-exporting is still allowed.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-navy">Submitted tickets on {date}</h2>
        <div className="mt-3 overflow-x-auto rounded-xl bg-white shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Tech</th>
                <th className="px-4 py-3">Billing</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Exported</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tickets.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-gray-500">No submitted tickets that day.</td></tr>
              )}
              {tickets.map((t) => (
                <tr key={t.id} className={exportable.includes(t) ? "" : "opacity-50"}>
                  <td className="px-4 py-3 font-medium text-navy">
                    <Link href={`/portal/admin/tickets/${t.id}`} className="hover:underline">#{t.ticketNumber}</Link>
                  </td>
                  <td className="px-4 py-3">
                    {t.customerName}{t.client?.customerNumber ? <span className="text-gray-400"> · #{t.client.customerNumber}</span> : null}
                  </td>
                  <td className="px-4 py-3">{t.tech.name}</td>
                  <td className="px-4 py-3">
                    {t.billingStatus === "BILLABLE" ? "Billable" : t.billingStatus === "NO_CHARGE" ? "No charge (excluded)" : "Needs review"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-navy">
                    {t.total != null ? `$${Number(t.total).toFixed(2)}` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                    {t.exportedAt ? `✓ ${fmtDateTime(t.exportedAt)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
