import { db } from "@/lib/db";
import { COMPANY } from "@/lib/constants";
import { fmtDate, fmtDateTime, fmtWhen } from "@/lib/queries";
import { getPricingSettings, fmtBracket } from "@/lib/pricing";
import AcceptTermsForm from "@/components/public/AcceptTermsForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pricing terms & service agreement" };

export default async function AcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const job = await db.job.findUnique({ where: { acceptToken: token } });

  const Shell = ({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) => (
    <main id="main" className="flex min-h-screen items-start justify-center bg-navy-50 px-4 py-8">
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="text-center">
          <span className="text-xl font-extrabold tracking-tight text-navy">
            Rowan <span className="text-accent">Heating &amp; Air Conditioning</span>
          </span>
        </div>
        <div className="card mt-6">{children}</div>
      </div>
    </main>
  );

  if (!job) {
    return (
      <Shell>
        <h1 className="text-lg font-bold text-navy">Link not found</h1>
        <p className="mt-2 text-sm text-gray-600">
          This link is no longer valid. If you need to reach us, call{" "}
          <a href={COMPANY.phoneHref} className="font-medium text-accent-600">{COMPANY.phone}</a>.
        </p>
      </Shell>
    );
  }

  if (job.termsAcceptedAt) {
    return (
      <Shell>
        <h1 className="text-lg font-bold text-navy">Already accepted — thank you!</h1>
        <p className="mt-2 text-sm text-gray-700">
          Our pricing terms and service agreement for your {job.service} appointment were accepted on{" "}
          {fmtDateTime(job.termsAcceptedAt)}{job.termsSignature ? <> (signed: <em>{job.termsSignature}</em>)</> : null}.
        </p>
        <p className="mt-3 text-xs text-gray-500">
          Need to change something? Call us at{" "}
          <a href={COMPANY.phoneHref} className="font-medium text-accent-600">{COMPANY.phone}</a>.
        </p>
      </Shell>
    );
  }

  const [rates, settings, pdfSetting] = await Promise.all([
    db.laborRate.findMany({ orderBy: [{ zone: "asc" }, { minutes: "asc" }] }),
    getPricingSettings(),
    db.setting.findUnique({ where: { key: "terms.agreementPdf" } }),
  ]);
  const zones = [...new Set(rates.map((r) => r.zone))];
  const brackets = [...new Set(rates.map((r) => r.minutes))].sort((a, b) => a - b);
  const rateFor = (zone: string, minutes: number) => rates.find((r) => r.zone === zone && r.minutes === minutes);

  const deadline = new Date(job.scheduledAt);
  deadline.setDate(deadline.getDate() - 1);

  return (
    <Shell wide>
      <h1 className="text-lg font-bold text-navy">Please review before your appointment</h1>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500">Service</dt>
          <dd className="text-right font-medium text-navy">{job.service}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500">Address</dt>
          <dd className="text-right">{job.address}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-gray-500">Appointment</dt>
          <dd className="text-right">{fmtWhen(job.scheduledAt, job.window)}</dd>
        </div>
      </dl>
      <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
        Please accept by <strong>{job.window ? fmtDate(deadline) : fmtDateTime(deadline)}</strong> — one day before your appointment.
      </p>

      {/* Hourly pricing terms */}
      <h2 className="mt-6 font-bold text-navy">Hourly pricing terms</h2>
      <p className="mt-1 text-sm text-gray-600">
        We don&apos;t know in advance how long a repair will take, so labor is billed by time on
        site: rounded up to the next {settings.roundToMinutes} minutes, with a{" "}
        {fmtBracket(settings.minimumMinutes)} minimum. Rates below are for one technician.
      </p>
      <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-gray-100">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-navy-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Time on site</th>
              {zones.map((z) => <th key={z} className="px-3 py-2">{z}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {brackets.map((m) => (
              <tr key={m}>
                <td className="whitespace-nowrap px-3 py-1.5 font-medium text-navy">{fmtBracket(m)}</td>
                {zones.map((z) => {
                  const r = rateFor(z, m);
                  return <td key={z} className="px-3 py-1.5">{r ? `$${Number(r.price).toFixed(2)}` : "—"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-2 space-y-1 text-xs text-gray-600">
        <li>• Two technicians: {settings.twoTechMultiplier}× the single-technician rate.</li>
        <li>• Ladder use: ${settings.ladderFee.toFixed(2)} flat.</li>
        <li>• Maintenance policy visits: ${settings.maintenanceRate.toFixed(2)} flat rate.</li>
        <li>• Parts and refrigerant are billed separately at our current prices.</li>
      </ul>

      {/* Service agreement */}
      <h2 className="mt-6 font-bold text-navy">Service agreement</h2>
      {job.termsSnapshot ? (
        <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm text-gray-800">
          {job.termsSnapshot}
        </div>
      ) : (
        <p className="mt-2 text-sm text-gray-500">
          (No written agreement on file for this appointment — the pricing terms above apply.)
        </p>
      )}
      {pdfSetting?.value && (
        <p className="mt-2 text-sm">
          <a href="/api/agreement" target="_blank" rel="noreferrer" className="font-medium text-accent-600 hover:underline">
            View the agreement as a PDF ↗
          </a>
        </p>
      )}

      <div className="mt-6 border-t border-gray-100 pt-5">
        <AcceptTermsForm token={token} />
      </div>
      <p className="mt-4 text-xs text-gray-500">
        Questions before accepting? Call us at{" "}
        <a href={COMPANY.phoneHref} className="font-medium text-accent-600">{COMPANY.phone}</a>.
      </p>
    </Shell>
  );
}
