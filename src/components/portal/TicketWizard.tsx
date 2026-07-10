"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveTicketSection, addTicketPart, removeTicketPart, submitTicket, deleteTicketPhoto,
} from "@/lib/actions/tickets";
import type { ActionState } from "@/lib/actions/jobs";

/**
 * Mobile-first, step-by-step service ticket wizard. Every section saves the
 * draft independently ("Save & continue"), so a tech can fill it out of
 * order or come back later. The final step shows the auto-computed price —
 * techs can't edit it, only admins can adjust after submit.
 */

export type WizardTicket = {
  id: string;
  ticketNumber: number;
  clientId: string | null;
  customerName: string;
  serviceAddress: string;
  serviceDate: string; // yyyy-mm-dd
  timeIn: string; // datetime-local or ""
  timeOut: string;
  zone: string | null;
  techCount: number;
  ladderUsed: boolean;
  maintenanceVisit: boolean;
  systemType: string | null;
  brand: string | null;
  modelNumber: string | null;
  serialNumber: string | null;
  ageYears: number | null;
  capRated: string | null;
  capTested: string | null;
  suctionBefore: string | null;
  suctionAfter: string | null;
  liquidBefore: string | null;
  liquidAfter: string | null;
  superheat: string | null;
  subcooling: string | null;
  compressorAmps: string | null;
  fanAmps: string | null;
  supplyAirTemp: string | null;
  refrigerantType: string | null;
  refrigerantLbs: number | null;
  readingsNotes: string | null;
  workPerformed: string | null;
  billingStatus: string;
};

export type WizardClient = { id: string; name: string; customerNumber: number | null; address: string | null };
export type WizardPart = { id: string; name: string; partNumber: string | null; unit: string; unitPrice: number };
export type WizardPartLine = { id: string; label: string; qty: number | null; amount: number };
export type WizardPhoto = { id: string; fileName: string };
export type WizardPricing = {
  lines: { kind: string; label: string; qty?: number; unitPrice?: number; amount: number }[];
  laborTotal: number;
  partsTotal: number;
  total: number;
  needsManualPricing: boolean;
  problems: string[];
};

const STEPS = [
  "Customer & Job", "Time & Labor", "Equipment", "Readings", "Work Performed",
  "Parts Used", "Billing Status", "Photos", "Review & Submit",
];

const SYSTEM_TYPES = ["Furnace", "Boiler", "Air Conditioner", "Heat Pump", "Mini Split", "Geothermal", "Water Heater", "Other"];
const BRANDS = ["Trane", "Carrier", "WaterFurnace", "Other"];
const REFRIGERANTS = ["R-22", "R-410a", "Other"];

const money = (n: number) => `$${n.toFixed(2)}`;

/* One section's form: saves via the server action, then advances the step. */
function SectionForm({
  ticketId, section, onSaved, children, submitLabel = "Save & continue",
}: {
  ticketId: string;
  section: string;
  onSaved: () => void;
  children: React.ReactNode;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(saveTicketSection, { ok: false } as ActionState);
  const router = useRouter();
  const advanced = useRef<ActionState | null>(null);

  useEffect(() => {
    if (state.ok && advanced.current !== state) {
      advanced.current = state;
      router.refresh();
      onSaved();
    }
  }, [state, router, onSaved]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="section" value={section} />
      {children}
      {state.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

/* Bulk photo uploader: multi-select + drag-and-drop, client-side compression,
 * per-file progress. Uploads never block the rest of the wizard. */
function PhotoUploader({ ticketId, onUploaded }: { ticketId: string; onUploaded: () => void }) {
  type UploadItem = { key: string; name: string; status: "working" | "done" | "error"; error?: string };
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function compress(file: File): Promise<{ blob: Blob; name: string }> {
    if (!file.type.startsWith("image/") || file.type === "image/gif") return { blob: file, name: file.name };
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
      if (blob && blob.size < file.size) {
        return { blob, name: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
      }
    } catch {
      // Some formats (HEIC on non-Safari) can't decode in-browser — send as-is.
    }
    return { blob: file, name: file.name };
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.size > 0);
    for (const file of list) {
      const key = `${file.name}-${Date.now()}-${Math.random()}`;
      setItems((prev) => [...prev, { key, name: file.name, status: "working" }]);
      // Sequential keeps memory + connection use sane on a phone in the field.
      try {
        const { blob, name } = await compress(file);
        const form = new FormData();
        form.append("photo", new File([blob], name, { type: blob.type || file.type }));
        const res = await fetch(`/api/tickets/${ticketId}/photos`, { method: "POST", body: form });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Upload failed (${res.status})`);
        }
        setItems((prev) => prev.map((i) => (i.key === key ? { ...i, status: "done" } : i)));
        onUploaded();
      } catch (e) {
        setItems((prev) =>
          prev.map((i) => (i.key === key ? { ...i, status: "error", error: e instanceof Error ? e.message : "Failed" } : i))
        );
      }
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center text-sm transition ${
          dragOver ? "border-accent bg-accent-50/50" : "border-navy-200 bg-navy-50/50 hover:border-accent"
        }`}
      >
        <p className="font-medium text-navy">Tap to pick photos, or drag them here</p>
        <p className="mt-1 text-xs text-gray-500">Select as many as you like — they compress and upload in the background.</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }}
        />
      </div>
      {items.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {items.map((i) => (
            <li key={i.key} className="flex items-center justify-between gap-2">
              <span className="truncate text-gray-700">{i.name}</span>
              {i.status === "working" && <span className="shrink-0 text-gray-500">Uploading…</span>}
              {i.status === "done" && <span className="shrink-0 font-medium text-green-700">✓ Uploaded</span>}
              {i.status === "error" && <span className="shrink-0 font-medium text-red-600">{i.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TicketWizard({
  ticket, clients, parts, partLines, photos, zones, pricing,
}: {
  ticket: WizardTicket;
  clients: WizardClient[];
  parts: WizardPart[];
  partLines: WizardPartLine[];
  photos: WizardPhoto[];
  zones: string[];
  pricing: WizardPricing;
}) {
  const [step, setStep] = useState(0);
  const router = useRouter();
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));

  // Customer step: picking an account autofills the fields (still editable).
  const [custName, setCustName] = useState(ticket.customerName);
  const [custAddress, setCustAddress] = useState(ticket.serviceAddress);

  const [partState, partAction, partPending] = useActionState(addTicketPart, { ok: false } as ActionState);
  const partSaved = useRef<ActionState | null>(null);
  useEffect(() => {
    if (partState.ok && partSaved.current !== partState) {
      partSaved.current = partState;
      router.refresh();
    }
  }, [partState, router]);

  const [submitState, submitAction, submitPending] = useActionState(submitTicket, { ok: false } as ActionState);
  useEffect(() => {
    if (submitState.ok) router.refresh();
  }, [submitState, router]);

  return (
    <div className="space-y-4">
      {/* Step chips */}
      <nav aria-label="Ticket sections" className="-mx-4 overflow-x-auto px-4">
        <ol className="flex gap-1.5">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => setStep(i)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  i === step ? "bg-navy text-white" : "bg-navy-100 text-navy-700 hover:bg-navy-200"
                }`}
              >
                {i + 1}. {label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <section className="card">
        <h2 className="font-bold text-navy">{STEPS[step]}</h2>

        {step === 0 && (
          <SectionForm ticketId={ticket.id} section="customer" onSaved={next}>
            <div className="mt-3">
              <label htmlFor="clientId" className="label">Existing customer (optional)</label>
              <select
                id="clientId"
                name="clientId"
                className="input"
                defaultValue={ticket.clientId ?? ""}
                onChange={(e) => {
                  const c = clients.find((x) => x.id === e.target.value);
                  if (c) { setCustName(c.name); if (c.address) setCustAddress(c.address); }
                }}
              >
                <option value="">— No portal account / one-time customer —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.customerNumber ? ` · #${c.customerNumber}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="customerName" className="label">Customer name</label>
              <input id="customerName" name="customerName" required className="input" value={custName} onChange={(e) => setCustName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="serviceAddress" className="label">Service address</label>
              <input id="serviceAddress" name="serviceAddress" required className="input" value={custAddress} onChange={(e) => setCustAddress(e.target.value)} />
            </div>
            <div>
              <label htmlFor="serviceDate" className="label">Service date</label>
              <input id="serviceDate" name="serviceDate" type="date" required defaultValue={ticket.serviceDate} className="input" />
            </div>
          </SectionForm>
        )}

        {step === 1 && (
          <SectionForm ticketId={ticket.id} section="time" onSaved={next}>
            <p className="mt-1 text-xs text-gray-500">Time in/out drives the price — it rounds up to the next 15-minute bracket.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="timeIn" className="label">Time in</label>
                <input id="timeIn" name="timeIn" type="datetime-local" defaultValue={ticket.timeIn} className="input" />
              </div>
              <div>
                <label htmlFor="timeOut" className="label">Time out</label>
                <input id="timeOut" name="timeOut" type="datetime-local" defaultValue={ticket.timeOut} className="input" />
              </div>
              <div>
                <label htmlFor="zone" className="label">Zone</label>
                <select id="zone" name="zone" className="input" defaultValue={ticket.zone ?? ""}>
                  <option value="">Select…</option>
                  {zones.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="techCount" className="label">Number of technicians</label>
                <select id="techCount" name="techCount" className="input" defaultValue={String(ticket.techCount)}>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="ladderUsed" defaultChecked={ticket.ladderUsed} className="h-4 w-4" />
              Ladder used
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="maintenanceVisit" defaultChecked={ticket.maintenanceVisit} className="h-4 w-4" />
              Maintenance policy visit (flat rate)
            </label>
          </SectionForm>
        )}

        {step === 2 && (
          <SectionForm ticketId={ticket.id} section="equipment" onSaved={next}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="systemType" className="label">System type</label>
                <select id="systemType" name="systemType" className="input" defaultValue={ticket.systemType ?? ""}>
                  <option value="">Select…</option>
                  {SYSTEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="brand" className="label">Brand</label>
                <select id="brand" name="brand" className="input" defaultValue={ticket.brand ?? ""}>
                  <option value="">Select…</option>
                  {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="modelNumber" className="label">Model #</label>
                <input id="modelNumber" name="modelNumber" defaultValue={ticket.modelNumber ?? ""} className="input" />
              </div>
              <div>
                <label htmlFor="serialNumber" className="label">Serial #</label>
                <input id="serialNumber" name="serialNumber" defaultValue={ticket.serialNumber ?? ""} className="input" />
              </div>
              <div>
                <label htmlFor="ageYears" className="label">Age (years, if known)</label>
                <input id="ageYears" name="ageYears" type="number" min={0} defaultValue={ticket.ageYears ?? ""} className="input" />
              </div>
            </div>
          </SectionForm>
        )}

        {step === 3 && (
          <SectionForm ticketId={ticket.id} section="readings" onSaved={next}>
            <p className="mt-1 text-xs text-gray-500">All optional — record what you measured.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="capRated">Capacitor rated (e.g. 35/5)</label><input id="capRated" name="capRated" defaultValue={ticket.capRated ?? ""} className="input" /></div>
              <div><label className="label" htmlFor="capTested">Capacitor tested (e.g. 36.62/5.07)</label><input id="capTested" name="capTested" defaultValue={ticket.capTested ?? ""} className="input" /></div>
              <div><label className="label" htmlFor="suctionBefore">Suction PSI — before</label><input id="suctionBefore" name="suctionBefore" defaultValue={ticket.suctionBefore ?? ""} className="input" /></div>
              <div><label className="label" htmlFor="suctionAfter">Suction PSI — after</label><input id="suctionAfter" name="suctionAfter" defaultValue={ticket.suctionAfter ?? ""} className="input" /></div>
              <div><label className="label" htmlFor="liquidBefore">Liquid PSI — before</label><input id="liquidBefore" name="liquidBefore" defaultValue={ticket.liquidBefore ?? ""} className="input" /></div>
              <div><label className="label" htmlFor="liquidAfter">Liquid PSI — after</label><input id="liquidAfter" name="liquidAfter" defaultValue={ticket.liquidAfter ?? ""} className="input" /></div>
              <div><label className="label" htmlFor="superheat">Superheat (°)</label><input id="superheat" name="superheat" defaultValue={ticket.superheat ?? ""} className="input" /></div>
              <div><label className="label" htmlFor="subcooling">Subcooling (°)</label><input id="subcooling" name="subcooling" defaultValue={ticket.subcooling ?? ""} className="input" /></div>
              <div><label className="label" htmlFor="compressorAmps">Compressor amps</label><input id="compressorAmps" name="compressorAmps" defaultValue={ticket.compressorAmps ?? ""} className="input" /></div>
              <div><label className="label" htmlFor="fanAmps">Outdoor fan motor amps</label><input id="fanAmps" name="fanAmps" defaultValue={ticket.fanAmps ?? ""} className="input" /></div>
              <div><label className="label" htmlFor="supplyAirTemp">Supply air temp (°)</label><input id="supplyAirTemp" name="supplyAirTemp" defaultValue={ticket.supplyAirTemp ?? ""} className="input" /></div>
              <div>
                <label className="label" htmlFor="refrigerantType">Refrigerant added — type</label>
                <select id="refrigerantType" name="refrigerantType" className="input" defaultValue={ticket.refrigerantType ?? ""}>
                  <option value="">None</option>
                  {REFRIGERANTS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div><label className="label" htmlFor="refrigerantLbs">Refrigerant added — pounds</label><input id="refrigerantLbs" name="refrigerantLbs" type="number" step="0.1" min={0} defaultValue={ticket.refrigerantLbs ?? ""} className="input" /></div>
            </div>
            <div>
              <label className="label" htmlFor="readingsNotes">Anything else you measured</label>
              <textarea id="readingsNotes" name="readingsNotes" rows={2} defaultValue={ticket.readingsNotes ?? ""} className="input" />
            </div>
            <p className="text-xs text-gray-500">
              Note: refrigerant recorded here is for the record — to bill it, also add it under Parts Used.
            </p>
          </SectionForm>
        )}

        {step === 4 && (
          <SectionForm ticketId={ticket.id} section="work" onSaved={next}>
            <label htmlFor="workPerformed" className="label">
              Diagnosis, cause, what was done, and recommendations to the homeowner
            </label>
            <textarea
              id="workPerformed"
              name="workPerformed"
              rows={8}
              required
              defaultValue={ticket.workPerformed ?? ""}
              placeholder="Found… Caused by… Replaced… Recommended…"
              className="input"
            />
          </SectionForm>
        )}

        {step === 5 && (
          <div className="mt-3 space-y-4">
            <ul className="space-y-2">
              {partLines.length === 0 && <li className="text-sm text-gray-500">No parts added.</li>}
              {partLines.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg bg-navy-50 p-3 text-sm">
                  <span>{l.qty && l.qty !== 1 ? `${l.qty} × ` : ""}{l.label}</span>
                  <span className="flex items-center gap-3 whitespace-nowrap">
                    <span className="font-semibold text-navy">{money(l.amount)}</span>
                    <form action={removeTicketPart}>
                      <input type="hidden" name="lineId" value={l.id} />
                      <button type="submit" className="text-xs font-medium text-red-600 hover:underline">Remove</button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>

            <form action={partAction} className="space-y-2 border-t border-gray-100 pt-3">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <label htmlFor="priceItemId" className="label">Add a part from the price book</label>
              <div className="flex flex-wrap gap-2">
                <select id="priceItemId" name="priceItemId" required className="input flex-1" defaultValue="">
                  <option value="" disabled>Select a part…</option>
                  {parts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.partNumber ? ` (#${p.partNumber})` : ""} — {money(p.unitPrice)}{p.unit === "PER_POUND" ? "/lb" : ""}
                    </option>
                  ))}
                </select>
                <input name="qty" type="number" step="0.1" min="0.1" defaultValue="1" required className="input !w-24" aria-label="Quantity (each or pounds)" />
                <button type="submit" disabled={partPending} className="btn-small">{partPending ? "Adding…" : "Add"}</button>
              </div>
              <p className="text-xs text-gray-500">Qty is pieces — or pounds for per-lb refrigerant.</p>
              {partState.error && <p className="text-sm font-medium text-red-600">{partState.error}</p>}
            </form>

            <button type="button" onClick={next} className="btn-primary w-full sm:w-auto">Continue</button>
          </div>
        )}

        {step === 6 && (
          <SectionForm ticketId={ticket.id} section="billing" onSaved={next}>
            <div className="mt-2 space-y-2">
              {[
                { v: "BILLABLE", label: "Billable", hint: "Price auto-calculates from time, zone, add-ons, and parts." },
                { v: "NO_CHARGE", label: "No charge", hint: "Warranty, callback, goodwill — total is $0." },
                { v: "NEEDS_REVIEW", label: "Needs review", hint: "Not sure what was quoted — office prices it." },
              ].map((o) => (
                <label key={o.v} className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-50/40">
                  <input type="radio" name="billingStatus" value={o.v} defaultChecked={ticket.billingStatus === o.v} className="mt-0.5" />
                  <span>
                    <span className="font-semibold text-navy">{o.label}</span>
                    <span className="block text-xs text-gray-500">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </SectionForm>
        )}

        {step === 7 && (
          <div className="mt-3 space-y-4">
            <PhotoUploader ticketId={ticket.id} onUploaded={() => router.refresh()} />
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {photos.map((p) => (
                  <div key={p.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/attachments/${p.id}`} alt={p.fileName} className="h-24 w-full rounded-lg object-cover" />
                    <form action={deleteTicketPhoto} className="absolute right-1 top-1">
                      <input type="hidden" name="attachmentId" value={p.id} />
                      <button type="submit" aria-label={`Remove ${p.fileName}`} className="rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">
                        ✕
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={next} className="btn-primary w-full sm:w-auto">Continue</button>
          </div>
        )}

        {step === 8 && (
          <div className="mt-3 space-y-4">
            {ticket.billingStatus === "NO_CHARGE" ? (
              <p className="rounded-lg bg-navy-50 p-3 text-sm text-gray-700">No charge — this ticket totals <strong>$0.00</strong>.</p>
            ) : ticket.billingStatus === "NEEDS_REVIEW" ? (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                Marked <strong>Needs Review</strong> — it submits without a locked price and the office prices it.
              </p>
            ) : (
              <>
                {pricing.problems.length > 0 && (
                  <ul className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    {pricing.problems.map((p) => <li key={p}>⚠ {p}</li>)}
                  </ul>
                )}
                <ul className="divide-y divide-gray-100 rounded-lg bg-navy-50 p-3 text-sm">
                  {pricing.lines.length === 0 && <li className="py-1 text-gray-500">Nothing priced yet.</li>}
                  {pricing.lines.map((l, i) => (
                    <li key={i} className="flex justify-between gap-3 py-1.5">
                      <span>{l.qty && l.qty !== 1 ? `${l.qty} × ` : ""}{l.label}</span>
                      <span className="whitespace-nowrap font-medium text-navy">{money(l.amount)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-3 py-2 text-base font-bold text-navy">
                    <span>Total</span>
                    <span>{pricing.needsManualPricing ? "Manual pricing" : money(pricing.total)}</span>
                  </li>
                </ul>
                <p className="text-xs text-gray-500">
                  The price comes from the office price book and can&apos;t be edited here — the office can adjust after submit.
                </p>
              </>
            )}

            <form action={submitAction}>
              <input type="hidden" name="ticketId" value={ticket.id} />
              {submitState.error && <p className="mb-2 text-sm font-medium text-red-600">{submitState.error}</p>}
              <button type="submit" disabled={submitPending} className="btn-primary w-full sm:w-auto">
                {submitPending ? "Submitting…" : "Submit ticket"}
              </button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
