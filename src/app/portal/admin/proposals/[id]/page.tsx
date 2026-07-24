import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { deleteProposal } from "@/lib/actions/proposals";
import ProposalEditor from "@/components/portal/ProposalEditor";
import ConfirmForm from "@/components/portal/ConfirmForm";

export const metadata = { title: "Edit Proposal" };
export const dynamic = "force-dynamic";

const ymd = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

export default async function EditProposal({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("ADMIN");
  const { id } = await params;

  const [proposal, clients] = await Promise.all([
    db.proposal.findUnique({ where: { id } }),
    db.user.findMany({
      where: { role: "CLIENT", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, customerNumber: true, address: true, phone: true, email: true },
    }),
  ]);
  if (!proposal) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">Edit proposal</h1>
        <div className="flex items-center gap-4">
          <ConfirmForm action={deleteProposal} confirmText="Delete this proposal? This can't be undone.">
            <input type="hidden" name="id" value={proposal.id} />
            <button type="submit" className="text-sm font-medium text-red-600 hover:underline">Delete</button>
          </ConfirmForm>
          <Link href="/portal/admin/proposals" className="text-sm font-medium text-accent-600 hover:underline">
            ← All proposals
          </Link>
        </div>
      </div>

      <ProposalEditor
        proposal={{
          id: proposal.id,
          title: proposal.title,
          date: ymd(proposal.date),
          clientId: proposal.clientId,
          customerName: proposal.customerName,
          phone: proposal.phone ?? "",
          email: proposal.email ?? "",
          address: proposal.address,
          body: proposal.body,
          price: proposal.price ?? "",
          paymentTerms: proposal.paymentTerms ?? "",
          note: proposal.note ?? "",
        }}
        clients={clients}
      />
    </div>
  );
}
