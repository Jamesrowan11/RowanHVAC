import { db } from "@/lib/db";
import { COMPANY } from "@/lib/constants";
import { fmtDateTime, fmtWhen } from "@/lib/queries";
import { respondNextUp } from "@/lib/actions/confirm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm your appointment" };

export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const job = await db.job.findUnique({ where: { confirmToken: token } });

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main id="main" className="flex min-h-screen items-center justify-center bg-navy-50 px-4">
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

  if (!job) {
    return (
      <Shell>
        <h1 className="text-lg font-bold text-navy">Link not found</h1>
        <p className="mt-2 text-sm text-gray-600">
          This confirmation link is no longer valid. If you need to reach us, call{" "}
          <a href={COMPANY.phoneHref} className="font-medium text-accent-600">{COMPANY.phone}</a>.
        </p>
      </Shell>
    );
  }

  // Already answered — show a friendly recap.
  if (job.confirmStatus === "READY" || job.confirmStatus === "WAIT") {
    return (
      <Shell>
        <h1 className="text-lg font-bold text-navy">Thanks — we&apos;ve got it!</h1>
        <p className="mt-2 text-sm text-gray-700">
          {job.confirmStatus === "READY"
            ? "You let us know you're ready. Our technician is on the way."
            : "You asked to wait for a later time — we'll be in touch to reschedule."}
        </p>
        <p className="mt-3 text-xs text-gray-500">
          Need to change something? Call us at{" "}
          <a href={COMPANY.phoneHref} className="font-medium text-accent-600">{COMPANY.phone}</a>.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-lg font-bold text-navy">You&apos;re next!</h1>
      <p className="mt-2 text-sm text-gray-700">
        Our technician is about ready to head your way for your{" "}
        <span className="font-semibold">{job.service}</span> appointment
        {job.address ? <> at {job.address}</> : null}. Are you all set for us to
        come now, or would you prefer to wait for a later time?
      </p>
      <p className="mt-1 text-xs text-gray-500">Originally scheduled for {fmtWhen(job.scheduledAt, job.window)}.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <form action={respondNextUp}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="choice" value="READY" />
          <button type="submit" className="btn-primary w-full">Yes, come now</button>
        </form>
        <form action={respondNextUp}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="choice" value="WAIT" />
          <button type="submit" className="btn-secondary w-full">I&apos;d prefer to wait</button>
        </form>
      </div>
    </Shell>
  );
}
