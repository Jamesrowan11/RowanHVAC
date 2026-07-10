import Link from "next/link";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/queries";
import { createProposal } from "@/lib/actions/proposals";

export const metadata = { title: "Proposals" };
export const dynamic = "force-dynamic";

export default async function AdminProposals() {
  await requireRole("ADMIN");

  const proposals = await db.proposal.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: { client: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Proposals</h1>
          <p className="mt-1 text-sm text-gray-500">
            Installation proposals — edit with a live document preview, assign to a
            client, and download as PDF.
          </p>
        </div>
        <form action={createProposal}>
          <button type="submit" className="btn-primary">New proposal</button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Assigned to</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {proposals.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-gray-500">No proposals yet — create your first above.</td></tr>
            )}
            {proposals.map((p) => (
              <tr key={p.id} className="hover:bg-navy-50/50">
                <td className="whitespace-nowrap px-4 py-3">{fmtDate(p.date)}</td>
                <td className="px-4 py-3 font-medium text-navy">{p.title}</td>
                <td className="px-4 py-3">{p.customerName || <span className="italic text-gray-400">—</span>}</td>
                <td className="px-4 py-3">{p.client ? p.client.name : <span className="italic text-gray-400">Not assigned</span>}</td>
                <td className="whitespace-nowrap px-4 py-3">{p.price ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <span className="flex justify-end gap-3">
                    <Link href={`/portal/admin/proposals/${p.id}`} className="font-medium text-accent-600 hover:underline">Edit</Link>
                    <a href={`/print/proposal/${p.id}`} target="_blank" rel="noreferrer" className="font-medium text-accent-600 hover:underline">PDF</a>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
