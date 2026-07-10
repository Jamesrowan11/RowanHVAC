import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { getPricingSettings, fmtBracket } from "@/lib/pricing";
import {
  upsertLaborRate, deleteLaborRate, updatePricingSettings,
  createPriceItem, updatePriceItem, setPriceItemActive, deletePriceItem,
  updateAgreement, removeAgreementPdf,
} from "@/lib/actions/pricebook";
import ActionForm from "@/components/portal/ActionForm";
import ConfirmForm from "@/components/portal/ConfirmForm";

export const metadata = { title: "Price Book" };
export const dynamic = "force-dynamic";

export default async function AdminPriceBook() {
  await requireRole("ADMIN");

  const [rates, items, settings, agreementText, agreementPdf] = await Promise.all([
    db.laborRate.findMany({ orderBy: [{ zone: "asc" }, { minutes: "asc" }] }),
    db.priceBookItem.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    getPricingSettings(),
    db.setting.findUnique({ where: { key: "terms.agreementText" } }),
    db.setting.findUnique({ where: { key: "terms.agreementPdf" } }),
  ]);

  const zones = [...new Set(rates.map((r) => r.zone))];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-navy">Price Book</h1>
        <p className="mt-1 text-sm text-gray-500">
          Every price the ticket calculator uses lives here — change a number and
          it applies to new tickets immediately. Already-submitted tickets keep
          the prices they were computed with.
        </p>
      </div>

      {/* Pricing rules & add-ons */}
      <section className="card max-w-2xl">
        <h2 className="font-bold text-navy">Rules &amp; add-ons</h2>
        <ActionForm
          action={updatePricingSettings}
          submitLabel="Save rules"
          successMessage="Saved."
          resetOnSuccess={false}
          className="mt-3 grid gap-3 sm:grid-cols-3"
        >
          <div>
            <label htmlFor="ladderFee" className="label">Ladder fee ($)</label>
            <input id="ladderFee" name="ladderFee" type="number" step="0.01" defaultValue={settings.ladderFee} className="input" />
          </div>
          <div>
            <label htmlFor="maintenanceRate" className="label">Maintenance visit ($)</label>
            <input id="maintenanceRate" name="maintenanceRate" type="number" step="0.01" defaultValue={settings.maintenanceRate} className="input" />
          </div>
          <div>
            <label htmlFor="twoTechMultiplier" className="label">2-tech multiplier</label>
            <input id="twoTechMultiplier" name="twoTechMultiplier" type="number" step="0.1" defaultValue={settings.twoTechMultiplier} className="input" />
          </div>
          <div>
            <label htmlFor="roundToMinutes" className="label">Round up to (min)</label>
            <input id="roundToMinutes" name="roundToMinutes" type="number" defaultValue={settings.roundToMinutes} className="input" />
          </div>
          <div>
            <label htmlFor="minimumMinutes" className="label">Minimum bill (min)</label>
            <input id="minimumMinutes" name="minimumMinutes" type="number" defaultValue={settings.minimumMinutes} className="input" />
          </div>
          <div>
            <label htmlFor="maxMinutes" className="label">Table max (min)</label>
            <input id="maxMinutes" name="maxMinutes" type="number" defaultValue={settings.maxMinutes} className="input" />
          </div>
        </ActionForm>
        <p className="mt-2 text-xs text-gray-500">
          Durations round UP to the nearest {settings.roundToMinutes} minutes with a{" "}
          {fmtBracket(settings.minimumMinutes)} minimum. Anything over {fmtBracket(settings.maxMinutes)} is
          flagged for manual pricing instead of guessing.
        </p>
      </section>

      {/* Service agreement */}
      <section className="card max-w-2xl">
        <h2 className="font-bold text-navy">Service agreement</h2>
        <p className="mt-1 text-sm text-gray-500">
          Sent to every customer (with the hourly rates above) when their job or
          pickup is scheduled — they check a box and sign their name to accept.
          Each job keeps a snapshot of the exact text it sent, so editing this
          never changes what earlier customers signed.
        </p>
        <ActionForm
          action={updateAgreement}
          submitLabel="Save agreement"
          successMessage="Saved — new appointments get this version."
          resetOnSuccess={false}
          className="mt-3 space-y-3"
        >
          <textarea
            name="agreementText"
            rows={10}
            defaultValue={agreementText?.value ?? ""}
            placeholder="Paste your service agreement text here…"
            className="input font-mono text-xs"
            aria-label="Agreement text"
          />
          <div>
            <label htmlFor="agreementPdf" className="label">Attach as PDF too (optional)</label>
            <input id="agreementPdf" name="agreementPdf" type="file" accept="application/pdf" className="input" />
          </div>
        </ActionForm>
        {agreementPdf?.value && (
          <div className="mt-2 flex items-center gap-4 text-sm">
            <a href="/api/agreement" target="_blank" rel="noreferrer" className="font-medium text-accent-600 hover:underline">
              Current PDF ↗
            </a>
            <form action={removeAgreementPdf}>
              <button type="submit" className="text-xs font-medium text-red-600 hover:underline">Remove PDF</button>
            </form>
          </div>
        )}
      </section>

      {/* Labor rate table */}
      <section>
        <h2 className="text-lg font-bold text-navy">Labor rates (single technician)</h2>
        <p className="mt-1 text-sm text-gray-500">
          Price by zone and time bracket. Leave the 2-tech column blank to use the
          multiplier ({settings.twoTechMultiplier}×); fill it to override that row.
        </p>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          {zones.map((zone) => (
            <div key={zone} className="overflow-x-auto rounded-xl bg-white shadow-card">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">{zone}</th>
                    <th className="px-3 py-2">Price</th>
                    <th className="px-3 py-2">2-tech override</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rates.filter((r) => r.zone === zone).map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-3 py-1.5 font-medium text-navy">{fmtBracket(r.minutes)}</td>
                      <td colSpan={2} className="px-3 py-1.5">
                        <ActionForm
                          action={upsertLaborRate}
                          submitLabel="Save"
                          resetOnSuccess={false}
                          buttonClassName="btn-small-outline"
                          className="flex items-center gap-2 [&>button]:mt-0"
                        >
                          <input type="hidden" name="zone" value={r.zone} />
                          <input type="hidden" name="minutes" value={r.minutes} />
                          <input name="price" type="number" step="0.01" defaultValue={Number(r.price)} className="input !w-24" aria-label="Price" />
                          <input name="twoTechPrice" type="number" step="0.01" defaultValue={r.twoTechPrice ? Number(r.twoTechPrice) : ""} placeholder="auto" className="input !w-24" aria-label="Two-tech price" />
                        </ActionForm>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <ConfirmForm action={deleteLaborRate} confirmText={`Remove the ${zone} ${fmtBracket(r.minutes)} row?`}>
                          <input type="hidden" name="id" value={r.id} />
                          <button type="submit" className="text-xs font-medium text-red-600 hover:underline">Remove</button>
                        </ConfirmForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div className="card mt-4 max-w-xl">
          <h3 className="text-sm font-bold text-navy">Add a rate row (new bracket or new zone)</h3>
          <ActionForm
            action={upsertLaborRate}
            submitLabel="Add row"
            successMessage="Added."
            className="mt-2 grid gap-2 sm:grid-cols-4"
          >
            <input name="zone" placeholder="Zone (e.g. DC)" required className="input" aria-label="Zone" />
            <input name="minutes" type="number" placeholder="Minutes" required className="input" aria-label="Minutes" />
            <input name="price" type="number" step="0.01" placeholder="Price" required className="input" aria-label="Price" />
            <input name="twoTechPrice" type="number" step="0.01" placeholder="2-tech (opt.)" className="input" aria-label="Two-tech price" />
          </ActionForm>
        </div>
      </section>

      {/* Parts & materials */}
      <section>
        <h2 className="text-lg font-bold text-navy">Parts &amp; materials</h2>
        <div className="card mt-3 max-w-xl">
          <h3 className="text-sm font-bold text-navy">Add an item</h3>
          <ActionForm
            action={createPriceItem}
            submitLabel="Add item"
            successMessage="Added."
            className="mt-2 grid gap-2 sm:grid-cols-2"
          >
            <input name="name" placeholder="Name (e.g. Capacitor 35/5, R-410a)" required className="input sm:col-span-2" aria-label="Name" />
            <input name="partNumber" placeholder="Part # (optional)" className="input" aria-label="Part number" />
            <div className="flex gap-2">
              <input name="unitPrice" type="number" step="0.01" placeholder="Price" required className="input" aria-label="Unit price" />
              <select name="unit" className="input" aria-label="Unit" defaultValue="EACH">
                <option value="EACH">each</option>
                <option value="PER_POUND">per lb</option>
              </select>
            </div>
          </ActionForm>
        </div>

        <div className="mt-4 space-y-3">
          {items.length === 0 && <p className="card text-sm text-gray-500">No parts yet — add your first above.</p>}
          {items.map((p) => (
            <div key={p.id} className={`card ${p.active ? "" : "opacity-60"}`}>
              <ActionForm
                action={updatePriceItem}
                submitLabel="Save"
                resetOnSuccess={false}
                buttonClassName="btn-small-outline"
                className="grid gap-2 sm:grid-cols-4 [&>button]:mt-0 sm:[&>button]:self-center"
              >
                <input type="hidden" name="id" value={p.id} />
                <input name="name" defaultValue={p.name} required className="input" aria-label="Name" />
                <input name="partNumber" defaultValue={p.partNumber ?? ""} placeholder="Part #" className="input" aria-label="Part number" />
                <div className="flex gap-2">
                  <input name="unitPrice" type="number" step="0.01" defaultValue={Number(p.unitPrice)} required className="input" aria-label="Unit price" />
                  <select name="unit" className="input" defaultValue={p.unit} aria-label="Unit">
                    <option value="EACH">each</option>
                    <option value="PER_POUND">per lb</option>
                  </select>
                </div>
              </ActionForm>
              <div className="mt-2 flex items-center gap-4 text-xs">
                <form action={setPriceItemActive}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="active" value={p.active ? "false" : "true"} />
                  <button type="submit" className="font-medium text-accent-600 hover:underline">
                    {p.active ? "Deactivate (hide from techs)" : "Reactivate"}
                  </button>
                </form>
                <ConfirmForm action={deletePriceItem} confirmText={`Delete "${p.name}" from the price book? Past tickets keep their prices.`}>
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="font-medium text-red-600 hover:underline">Delete</button>
                </ConfirmForm>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
