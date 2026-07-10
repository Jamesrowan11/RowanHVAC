import { db } from "@/lib/db";
import { COMPANY } from "@/lib/constants";
import { fmtDateTime } from "@/lib/queries";
import AcceptPriceForm from "@/components/public/AcceptPriceForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accept your quote" };

export default async function AcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const job = await db.job.findUnique({ where: { acceptToken: token } });

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main id="main" className="flex min-h-screen items-center justify-center bg-navy-50 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center">
          <span className="text-xl font-extrabold tracking-tight text-navy">
            Rowan <span className="text-accent">Heating &amp; Air Conditioning</span>
          </span>
        </div>
        <div className="card mt-6">{children}</div>
      </div>
    </main>
  );

  if (!job || job.quotedPrice == null) {
    return (
      <Shell>
        <h1 className="text-lg font-bold text-navy">Link not found</h1>
        <p className="mt-2 text-sm text-gray-600">
          This quote link is no longer valid. If you need to reach us, call{" "}
          <a href={COMPANY.phoneHref} className="font-medium text-accent-600">{COMPANY.phone}</a>.
        </p>
      </Shell>
    );
  }

  const price = `$${Number(job.quotedPrice).toFixed(2)}`;

  if (job.priceAcceptedAt) {
    return (
      <Shell>
        <h1 className="text-lg font-bold text-navy">Already accepted — thank you!</h1>
        <p className="mt-2 text-sm text-gray-700">
          The {price} quote for your {job.service} appointment was accepted on{" "}
          {fmtDateTime(job.priceAcceptedAt)}{job.priceSignature ? <> (signed: <em>{job.priceSignature}</em>)</> : null}.
        </p>
        <p className="mt-3 text-xs text-gray-500">
          Need to change something? Call us at{" "}
          <a href={COMPANY.phoneHref} className="font-medium text-accent-600">{COMPANY.phone}</a>.
        </p>
      </Shell>
    );
  }

  const deadline = new Date(job.scheduledAt);
  deadline.setDate(deadline.getDate() - 1);

  return (
    <Shell>
      <h1 className="text-lg font-bold text-navy">Please review your quote</h1>
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
          <dd className="text-right">{fmtDateTime(job.scheduledAt)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-gray-100 pt-2 text-base">
          <dt className="font-semibold text-gray-700">Quoted price</dt>
          <dd className="font-bold text-navy">{price}</dd>
        </div>
      </dl>
      <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
        Please accept by <strong>{fmtDateTime(deadline)}</strong> — one day before your appointment.
      </p>
      <div className="mt-4">
        <AcceptPriceForm token={token} price={price} />
      </div>
      <p className="mt-4 text-xs text-gray-500">
        Questions about the price? Call us at{" "}
        <a href={COMPANY.phoneHref} className="font-medium text-accent-600">{COMPANY.phone}</a> before accepting.
      </p>
    </Shell>
  );
}
