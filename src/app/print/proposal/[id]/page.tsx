import { notFound } from "next/navigation";
import { requireUser } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/queries";
import ProposalDocument from "@/components/portal/ProposalDocument";
import PrintButton from "@/components/portal/PrintButton";

export const metadata = { title: "Proposal" };
export const dynamic = "force-dynamic";

/**
 * Clean print view of a proposal — no portal chrome, so "Print / Save as
 * PDF" produces just the document. Staff can open any proposal; a client
 * can only open one assigned to them.
 */
export default async function ProposalPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const proposal = await db.proposal.findFirst({
    where:
      user.role === "ADMIN" || user.role === "EMPLOYEE"
        ? { id }
        : { id, clientId: user.id },
  });
  if (!proposal) notFound();

  return (
    <main className="min-h-screen bg-navy-50 px-4 py-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[8.5in] items-center justify-between print:hidden">
        <p className="text-sm text-gray-600">
          Use your browser&apos;s print dialog and choose &ldquo;Save as PDF&rdquo; to download.
        </p>
        <PrintButton />
      </div>
      <ProposalDocument
        p={{
          title: proposal.title,
          date: fmtDate(proposal.date),
          customerName: proposal.customerName,
          phone: proposal.phone ?? "",
          email: proposal.email ?? "",
          address: proposal.address,
          body: proposal.body,
          price: proposal.price ?? "",
          paymentTerms: proposal.paymentTerms ?? "",
          note: proposal.note ?? "",
        }}
      />
    </main>
  );
}
