import { COMPANY } from "@/lib/constants";

export type ProposalFields = {
  title: string;
  date: string; // display-ready, e.g. "Jul 10, 2026"
  customerName: string;
  phone: string;
  email: string;
  address: string;
  body: string;
  price: string;
  paymentTerms: string;
  note: string;
};

/**
 * The proposal document itself — company letterhead, submitted-to / work-at
 * blocks, scope of work, price, terms, and signature lines. Pure markup, so
 * the editor renders it live as a preview and the print page renders it for
 * PDF download. Mirrors the paper proposals the company already uses.
 */
export default function ProposalDocument({ p }: { p: ProposalFields }) {
  return (
    <div className="mx-auto max-w-[8.5in] bg-white p-8 text-[13px] leading-relaxed text-gray-900 shadow-card print:p-0 print:shadow-none">
      {/* Letterhead */}
      <div className="border-b-2 border-navy pb-4 text-center">
        <p className="text-2xl font-extrabold tracking-tight text-navy">
          Rowan <span className="text-accent">Heating &amp; Air Conditioning</span>
        </p>
        <p className="mt-1 text-xs text-gray-600">
          {COMPANY.address} · {COMPANY.phone} · {COMPANY.email}
        </p>
        <p className="text-xs text-gray-600">Family owned &amp; operated since {COMPANY.foundingYear}</p>
      </div>

      <div className="mt-4 flex items-start justify-between gap-4">
        <h1 className="text-lg font-bold uppercase tracking-wide text-navy">{p.title || "Proposal"}</h1>
        <p className="text-sm">Date: <span className="font-medium">{p.date}</span></p>
      </div>

      {/* Submitted to / work at */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded border border-gray-300 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Proposal submitted to</p>
          <p className="mt-1 font-medium">{p.customerName || " "}</p>
          <p className="text-gray-700">{p.phone}</p>
          <p className="text-gray-700">{p.email}</p>
        </div>
        <div className="rounded border border-gray-300 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Work to be performed at</p>
          <p className="mt-1 whitespace-pre-wrap">{p.address || " "}</p>
        </div>
      </div>

      {/* Scope of work */}
      <div className="mt-5 min-h-[2in] whitespace-pre-wrap">{p.body}</div>

      {/* Price */}
      {p.price && (
        <p className="mt-5 border-t border-gray-300 pt-3">
          We propose to furnish material and labor — complete in accordance with the above
          specifications — for the sum of: <span className="text-base font-bold text-navy">{p.price}</span>
        </p>
      )}

      {/* Payment terms */}
      {p.paymentTerms && (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Payment terms</p>
          <p className="whitespace-pre-wrap">{p.paymentTerms}</p>
        </div>
      )}

      {p.note && (
        <p className="mt-3 whitespace-pre-wrap text-xs text-gray-600">{p.note}</p>
      )}

      {/* Signatures */}
      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        <div>
          <div className="border-t border-gray-500 pt-1 text-xs text-gray-600">
            Authorized signature — {COMPANY.name}
          </div>
        </div>
        <div />
        <div>
          <div className="border-t border-gray-500 pt-1 text-xs text-gray-600">
            Acceptance of proposal — signature
          </div>
          <p className="mt-1 text-[11px] text-gray-500">
            The above prices, specifications and conditions are satisfactory and are hereby
            accepted. You are authorized to do the work as specified.
          </p>
        </div>
        <div>
          <div className="border-t border-gray-500 pt-1 text-xs text-gray-600">Date</div>
        </div>
      </div>
    </div>
  );
}
