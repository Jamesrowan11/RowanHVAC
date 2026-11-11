import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PageHeader, EmptyState } from "@/components/portal/ui";
import { SpeedChart } from "@/components/portal/SpeedChart";
import {
  APP_TIMEZONE,
  dayRange,
  dtcDescription,
  fmtTime,
  isDay,
  readingNear,
  speedAlertMph,
  splitCodes,
  summarizeSpeeds,
  todayIn,
  zonedTime,
} from "@/lib/vehicle";

const CHART_POINTS = 1500;

/** Keeps the chart light without hiding peaks: max of each bucket. */
function downsample<T extends { t: number; mph: number }>(points: T[]): T[] {
  if (points.length <= CHART_POINTS) return points;
  const size = Math.ceil(points.length / CHART_POINTS);
  const out: T[] = [];
  for (let i = 0; i < points.length; i += size) {
    out.push(points.slice(i, i + size).reduce((a, b) => (b.mph > a.mph ? b : a)));
  }
  return out;
}

function dateLabel(d: Date) {
  return d.toLocaleDateString("en-US", { timeZone: APP_TIMEZONE, weekday: "short", month: "short", day: "numeric" });
}

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ van?: string; date?: string; limit?: string; at?: string }>;
}) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const tz = APP_TIMEZONE;

  // Every van that has ever reported, with its latest reading and codes.
  const [speedVans, codeVans] = await Promise.all([
    prisma.vehicleSpeed.groupBy({ by: ["vanName"], _max: { recordedAt: true } }),
    prisma.vehicleCodeReport.groupBy({ by: ["vanName"], _max: { recordedAt: true } }),
  ]);
  const vanNames = Array.from(new Set([...speedVans, ...codeVans].map((v) => v.vanName))).sort();

  const fleet = await Promise.all(
    vanNames.map(async (vanName) => {
      const [lastReading, codes] = await Promise.all([
        prisma.vehicleSpeed.findFirst({ where: { vanName }, orderBy: { recordedAt: "desc" } }),
        prisma.vehicleCodeReport.findFirst({ where: { vanName }, orderBy: { recordedAt: "desc" } }),
      ]);
      return { vanName, lastReading, codes };
    }),
  );

  const van = vanNames.find((v) => v === sp.van) ?? vanNames[0];
  const day = isDay(sp.date) ? sp.date : todayIn(tz);
  const limit = Math.min(150, Math.max(10, Number(sp.limit) || speedAlertMph() || 70));
  const { start, end } = dayRange(day, tz);

  const rows = van
    ? await prisma.vehicleSpeed.findMany({
        where: { vanName: van, recordedAt: { gte: start, lt: end } },
        orderBy: { recordedAt: "asc" },
        select: { recordedAt: true, mph: true, driverName: true },
      })
    : [];
  const summary = summarizeSpeeds(rows, limit);
  const drivers = Array.from(new Set(rows.map((r) => r.driverName)));
  const lookupAt = sp.at && /^\d{1,2}:\d{2}$/.test(sp.at) ? zonedTime(day, sp.at, tz) : null;
  const lookup = lookupAt ? readingNear(rows, lookupAt) : null;
  const codeHistory = van
    ? await prisma.vehicleCodeReport.findMany({
        where: { vanName: van },
        orderBy: { recordedAt: "desc" },
        take: 10,
      })
    : [];

  return (
    <>
      <PageHeader
        title="Vehicles"
        subtitle="Speed and engine trouble codes from each van's OBD-II adapter (van app → Menu → Vehicle). Visible to admins only."
      />

      {vanNames.length === 0 ? (
        <EmptyState>
          No vehicle data yet. In the van app, plug in an ELM327 OBD-II adapter and turn it on under
          Menu → Vehicle (OBD-II).
        </EmptyState>
      ) : (
        <>
          {/* Fleet status */}
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fleet.map(({ vanName, lastReading, codes }) => {
              const stored = splitCodes(codes?.storedCodes ?? "");
              const pending = splitCodes(codes?.pendingCodes ?? "");
              const trouble = !!codes && (codes.milOn || stored.length > 0);
              return (
                <Link
                  key={vanName}
                  href={`/portal/admin/vehicles?${new URLSearchParams({ van: vanName, date: day, limit: String(limit) })}`}
                  className={`card block p-4 hover:ring-2 hover:ring-navy-200 ${vanName === van ? "ring-2 ring-navy-900" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-navy-900">{vanName}</h3>
                    {trouble ? (
                      <span className="badge bg-red-100 text-red-800">⚠ Check engine</span>
                    ) : codes ? (
                      <span className="badge bg-green-100 text-green-800">✓ No codes</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-navy-600">
                    {lastReading
                      ? `${lastReading.mph} mph · ${dateLabel(lastReading.recordedAt)} ${fmtTime(lastReading.recordedAt, tz)} · ${lastReading.driverName}`
                      : "No speed readings yet"}
                  </p>
                  {(stored.length > 0 || pending.length > 0) && (
                    <p className="mt-1 text-xs text-navy-500">
                      {stored.length > 0 && <>Stored: {stored.join(", ")} </>}
                      {pending.length > 0 && <>Pending: {pending.join(", ")}</>}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Filters: one row */}
          <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-4">
            <div>
              <label className="label" htmlFor="v-van">Van</label>
              <select id="v-van" name="van" className="input !w-auto" defaultValue={van}>
                {vanNames.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="v-date">Day</label>
              <input id="v-date" name="date" type="date" className="input !w-auto" defaultValue={day} />
            </div>
            <div>
              <label className="label" htmlFor="v-limit">Speed limit (mph)</label>
              <input id="v-limit" name="limit" type="number" min={10} max={150} className="input !w-24" defaultValue={limit} />
            </div>
            <div>
              <label className="label" htmlFor="v-at">Speed at time</label>
              <input id="v-at" name="at" type="time" className="input !w-auto" defaultValue={sp.at ?? ""} />
            </div>
            <button type="submit" className="btn-navy">Show</button>
          </form>

          {lookupAt && (
            <div className="card mb-4 p-4 text-sm">
              {lookup ? (
                <>
                  <span className="text-navy-500">At {fmtTime(lookupAt, tz)}: </span>
                  <span className="text-lg font-semibold text-navy-900">{lookup.mph} mph</span>
                  <span className="text-navy-500">
                    {" "}(reading at {fmtTime(lookup.recordedAt, tz, true)}, driver {lookup.driverName})
                  </span>
                </>
              ) : (
                <span className="text-navy-500">
                  No reading within 5 minutes of {fmtTime(lookupAt, tz)} — the van was off or the adapter
                  wasn&apos;t connected.
                </span>
              )}
            </div>
          )}

          <div className="card mb-4 p-5">
            <h2 className="text-lg font-semibold text-navy-900">
              {van} · {dateLabel(start)}
            </h2>
            {rows.length === 0 ? (
              <p className="mt-2 text-sm text-navy-500">No speed readings for this day.</p>
            ) : (
              <>
                <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-navy-500">Top speed</dt>
                    <dd className="text-2xl font-bold text-navy-900">{summary.max?.mph} mph</dd>
                    <dd className="text-xs text-navy-500">at {summary.max && fmtTime(summary.max.recordedAt, tz)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-navy-500">Time moving</dt>
                    <dd className="text-2xl font-bold text-navy-900">
                      {Math.floor(summary.movingMinutes / 60)}h {summary.movingMinutes % 60}m
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-navy-500">Over {limit} mph</dt>
                    <dd className="text-2xl font-bold text-navy-900">{summary.events.length}×</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-navy-500">Logged</dt>
                    <dd className="text-sm font-semibold text-navy-900">
                      {summary.first && fmtTime(summary.first, tz)} – {summary.last && fmtTime(summary.last, tz)}
                    </dd>
                    <dd className="text-xs text-navy-500">{drivers.join(", ")}</dd>
                  </div>
                </dl>
                <div className="mt-4">
                  <SpeedChart
                    points={downsample(rows.map((r) => ({ t: r.recordedAt.getTime(), mph: r.mph })))}
                    limitMph={limit}
                    timeZone={tz}
                  />
                </div>
              </>
            )}
          </div>

          {summary.events.length > 0 && (
            <div className="card mb-4 p-5">
              <h2 className="mb-3 text-lg font-semibold text-navy-900">Times over {limit} mph</h2>
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-navy-500">
                  <tr>
                    <th className="py-1 font-medium">From</th>
                    <th className="py-1 font-medium">To</th>
                    <th className="py-1 font-medium">Top speed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {summary.events.map((e) => (
                    <tr key={e.start.toISOString()}>
                      <td className="py-2">{fmtTime(e.start, tz, true)}</td>
                      <td className="py-2">{fmtTime(e.end, tz, true)}</td>
                      <td className="py-2 font-semibold text-navy-900">{e.maxMph} mph</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card p-5">
            <h2 className="mb-3 text-lg font-semibold text-navy-900">Trouble codes · {van}</h2>
            {codeHistory.length === 0 ? (
              <p className="text-sm text-navy-500">No trouble-code reports from this van yet.</p>
            ) : (
              <ul className="space-y-4">
                {codeHistory.map((r, i) => {
                  const codes = [
                    ...splitCodes(r.storedCodes).map((c) => ({ c, kind: "Stored" })),
                    ...splitCodes(r.pendingCodes).map((c) => ({ c, kind: "Pending" })),
                  ];
                  return (
                    <li key={r.id} className={i > 0 ? "border-t border-navy-100 pt-3 text-navy-500" : ""}>
                      <p className="text-xs text-navy-500">
                        {i === 0 ? "Latest · " : ""}
                        {dateLabel(r.recordedAt)} {fmtTime(r.recordedAt, tz)} · {r.driverName} · check engine light{" "}
                        <strong className={r.milOn ? "text-red-700" : ""}>{r.milOn ? "ON" : "off"}</strong>
                      </p>
                      {codes.length === 0 ? (
                        <p className="text-sm">No codes.</p>
                      ) : (
                        <ul className="mt-1 space-y-1 text-sm">
                          {codes.map(({ c, kind }) => (
                            <li key={kind + c}>
                              <span className="font-mono font-semibold text-navy-900">{c}</span>{" "}
                              <span className="text-xs text-navy-500">({kind})</span>{" "}
                              {dtcDescription(c) ?? (
                                <a
                                  className="text-accent hover:underline"
                                  href={`https://www.google.com/search?q=${encodeURIComponent(c + " OBD code")}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Look up this code
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  );
}
