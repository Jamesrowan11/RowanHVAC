import Link from "next/link";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";

export const metadata = { title: "Analytics" };

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 0, label: "All time" },
];

function pct(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

/** A horizontal magnitude bar (single hue) for the funnel. */
function Bar({ value, max, label, sub }: { value: number; max: number; label: string; sub?: string }) {
  const width = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-navy">{label}</span>
        <span className="text-gray-500">
          {value.toLocaleString()}{sub ? ` · ${sub}` : ""}
        </span>
      </div>
      <div className="mt-1 h-3 w-full overflow-hidden rounded bg-navy-50">
        <div className="h-3 rounded bg-navy-600" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default async function AdminAnalytics({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireRole("ADMIN");
  const { days: daysParam } = await searchParams;
  const days = RANGES.some((r) => String(r.days) === daysParam) ? Number(daysParam) : 30;

  const since = days > 0 ? new Date(Date.now() - days * 86_400_000) : new Date(0);
  const where = { createdAt: { gte: since } };

  const [visits, callClicks, quoteClicks, leads] = await Promise.all([
    db.analyticsEvent.count({ where: { ...where, type: "PAGE_VIEW" } }),
    db.analyticsEvent.count({ where: { ...where, type: "CALL_CLICK" } }),
    db.analyticsEvent.count({ where: { ...where, type: "QUOTE_CLICK" } }),
    // Actual submitted quote/service requests from the website = real leads.
    db.quoteRequest.count({ where: { createdAt: { gte: since }, source: "PUBLIC" } }),
  ]);

  const totalLeadActions = callClicks + leads;
  const funnelMax = Math.max(visits, 1);

  const tiles = [
    { label: "Website visits", value: visits, sub: "in this period", accent: false },
    { label: "Call button clicks", value: callClicks, sub: `${pct(callClicks, visits)} of visits`, accent: false },
    { label: "Quote button clicks", value: quoteClicks, sub: `${pct(quoteClicks, visits)} of visits`, accent: false },
    { label: "Quote requests (leads)", value: leads, sub: `${pct(leads, visits)} conversion`, accent: true },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">Website Analytics</h1>
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <Link
              key={r.days}
              href={`/portal/admin/analytics?days=${r.days}`}
              className={days === r.days ? "btn-small" : "btn-small-outline"}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-500">
        How many people visit the website and take action — clicking{" "}
        <span className="font-medium text-navy">Call Now</span>, clicking{" "}
        <span className="font-medium text-navy">Request a Quote</span>, or actually
        submitting the quote form. These are your leads.
      </p>

      {/* KPI tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="card">
            <p className={`text-3xl font-extrabold ${t.accent ? "text-accent-600" : "text-navy"}`}>
              {t.value.toLocaleString()}
            </p>
            <p className="mt-1 text-sm font-medium text-gray-600">{t.label}</p>
            <p className="mt-0.5 text-xs text-gray-400">{t.sub}</p>
          </div>
        ))}
      </div>

      {/* Funnel */}
      <section className="card max-w-2xl space-y-4">
        <h2 className="font-bold text-navy">Visitor funnel</h2>
        <Bar value={visits} max={funnelMax} label="Visited the website" />
        <Bar value={callClicks} max={funnelMax} label="Clicked Call Now" sub={pct(callClicks, visits)} />
        <Bar value={quoteClicks} max={funnelMax} label="Clicked Request a Quote" sub={pct(quoteClicks, visits)} />
        <Bar value={leads} max={funnelMax} label="Submitted a quote request" sub={pct(leads, visits)} />
        <p className="pt-2 text-sm text-gray-600">
          Total lead actions (calls started + quote requests):{" "}
          <span className="font-semibold text-navy">{totalLeadActions.toLocaleString()}</span>
          {" "}({pct(totalLeadActions, visits)} of visits)
        </p>
      </section>

      <p className="max-w-2xl text-xs text-gray-400">
        Note: &ldquo;Call button clicks&rdquo; counts taps on the phone number/Call
        Now buttons — a strong signal of a call, though we can&apos;t see whether
        every tap became a completed call. &ldquo;Quote requests&rdquo; counts forms
        actually submitted, which also appear under Requests.
      </p>
    </div>
  );
}
