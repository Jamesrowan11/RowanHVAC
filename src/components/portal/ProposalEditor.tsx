"use client";

import { useActionState, useState } from "react";
import { saveProposal } from "@/lib/actions/proposals";
import ProposalDocument from "@/components/portal/ProposalDocument";
import type { ActionState } from "@/lib/actions/jobs";

type ClientOpt = { id: string; name: string; customerNumber: number | null; address: string | null; phone: string | null; email: string };

type Props = {
  proposal: {
    id: string;
    title: string;
    date: string; // yyyy-mm-dd
    clientId: string | null;
    customerName: string;
    phone: string;
    email: string;
    address: string;
    body: string;
    price: string;
    paymentTerms: string;
    note: string;
  };
  clients: ClientOpt[];
};

const fmtDisplayDate = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00`);
  return isNaN(d.getTime())
    ? ymd
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

/**
 * Proposal editor: fields on top, and the ACTUAL document rendering live at
 * the bottom — every keystroke shows up in the preview exactly as it will
 * print. Picking a client autofills their contact block (still editable).
 */
export default function ProposalEditor({ proposal, clients }: Props) {
  const [f, setF] = useState(proposal);
  const set = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((prev) => ({ ...prev, [key]: e.target.value }));

  const [state, formAction, pending] = useActionState(saveProposal, { ok: false } as ActionState);

  return (
    <div className="space-y-6">
      <form action={formAction} className="card space-y-4">
        <input type="hidden" name="id" value={f.id} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="title" className="label">Document title</label>
            <input id="title" name="title" value={f.title} onChange={set("title")} className="input" placeholder="Heat Pump Installation Proposal" />
          </div>
          <div>
            <label htmlFor="date" className="label">Date</label>
            <input id="date" name="date" type="date" value={f.date} onChange={set("date")} className="input" />
          </div>
        </div>

        <div>
          <label htmlFor="clientId" className="label">Assign to portal client (optional — shows in their portal &amp; emails them)</label>
          <select
            id="clientId"
            name="clientId"
            value={f.clientId ?? ""}
            onChange={(e) => {
              const c = clients.find((x) => x.id === e.target.value);
              setF((prev) => ({
                ...prev,
                clientId: e.target.value || null,
                ...(c
                  ? {
                      customerName: c.name,
                      phone: c.phone ?? prev.phone,
                      email: c.email,
                      address: c.address ?? prev.address,
                    }
                  : {}),
              }));
            }}
            className="input"
          >
            <option value="">— Not assigned —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.customerNumber ? ` · #${c.customerNumber}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="customerName" className="label">Customer name</label>
            <input id="customerName" name="customerName" value={f.customerName} onChange={set("customerName")} className="input" />
          </div>
          <div>
            <label htmlFor="phone" className="label">Phone</label>
            <input id="phone" name="phone" value={f.phone} onChange={set("phone")} className="input" />
          </div>
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" name="email" value={f.email} onChange={set("email")} className="input" />
          </div>
        </div>

        <div>
          <label htmlFor="address" className="label">Work to be performed at (address)</label>
          <input id="address" name="address" value={f.address} onChange={set("address")} className="input" />
        </div>

        <div>
          <label htmlFor="body" className="label">Scope of work — what you&apos;re furnishing &amp; installing</label>
          <textarea id="body" name="body" rows={10} value={f.body} onChange={set("body")} className="input font-mono text-xs" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="price" className="label">Total price (as you want it shown)</label>
            <input id="price" name="price" value={f.price} onChange={set("price")} className="input" placeholder="$14,500.00" />
          </div>
          <div>
            <label htmlFor="paymentTerms" className="label">Payment terms</label>
            <textarea id="paymentTerms" name="paymentTerms" rows={2} value={f.paymentTerms} onChange={set("paymentTerms")} className="input" placeholder="1/3 deposit upon acceptance, balance due on completion." />
          </div>
        </div>

        <div>
          <label htmlFor="note" className="label">Fine print / note (optional)</label>
          <textarea id="note" name="note" rows={2} value={f.note} onChange={set("note")} className="input" placeholder="This proposal may be withdrawn if not accepted within 30 days." />
        </div>

        {state.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
        {state.ok && <p className="text-sm font-medium text-green-700">Saved.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Saving…" : "Save proposal"}
          </button>
          <a href={`/print/proposal/${f.id}`} target="_blank" rel="noreferrer" className="btn-secondary">
            Download / print PDF ↗
          </a>
          <p className="text-xs text-gray-500">Save first — the PDF uses the last saved version.</p>
        </div>
      </form>

      {/* Live preview — exactly what prints */}
      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">
          Live preview — this is the document
        </h2>
        <ProposalDocument
          p={{
            title: f.title,
            date: fmtDisplayDate(f.date),
            customerName: f.customerName,
            phone: f.phone,
            email: f.email,
            address: f.address,
            body: f.body,
            price: f.price,
            paymentTerms: f.paymentTerms,
            note: f.note,
          }}
        />
      </div>
    </div>
  );
}
