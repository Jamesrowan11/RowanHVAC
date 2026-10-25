import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PageHeader, EmptyState, FlashFromSearchParams, fmtDate } from "@/components/portal/ui";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import { MANUAL_EQUIPMENT_TYPES, manualSearchWhere } from "@/lib/manuals";
import { deleteManual } from "../admin/actions";

function fmtSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function tabHref(brand: string, model?: string) {
  const p = new URLSearchParams({ brand });
  if (model) p.set("model", model);
  return `/portal/manuals?${p}`;
}

const sameText = (a: string, b?: string) => !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Manuals library, organized as brand tabs → model tabs → that model's
 * manuals. Tabs come from the manuals themselves: uploading a manual under a
 * new brand or model creates its tab.
 */
export default async function ManualsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; brand?: string; model?: string; message?: string; error?: string }>;
}) {
  const user = await requireRole("ADMIN", "EMPLOYEE");
  const isAdmin = user.role === "ADMIN";
  const sp = await searchParams;
  const q = sp.q?.trim();

  const brandRows = await prisma.manual.groupBy({
    by: ["brand"],
    _count: { _all: true },
    orderBy: { brand: "asc" },
  });
  const brands = brandRows.map((b) => ({ name: b.brand, count: b._count._all }));
  const brand = brands.find((b) => sameText(b.name, sp.brand))?.name ?? brands[0]?.name;

  const modelRows = brand
    ? await prisma.manual.groupBy({
        by: ["model"],
        where: { brand },
        _count: { _all: true },
        orderBy: { model: "asc" },
      })
    : [];
  const models = modelRows.map((m) => ({ name: m.model, count: m._count._all }));
  const model = models.find((m) => sameText(m.name, sp.model))?.name ?? models[0]?.name;

  const manuals = q
    ? await prisma.manual.findMany({
        where: manualSearchWhere(q),
        orderBy: [{ brand: "asc" }, { model: "asc" }, { createdAt: "asc" }],
        take: 200,
        include: { uploadedBy: { select: { name: true } } },
      })
    : brand && model
      ? await prisma.manual.findMany({
          where: { brand, model },
          orderBy: { createdAt: "asc" },
          include: { uploadedBy: { select: { name: true } } },
        })
      : [];

  return (
    <>
      <PageHeader
        title="Equipment Manuals"
        subtitle="Manuals by brand and model. Every van terminal gets these automatically and can keep them for offline use."
      />
      <FlashFromSearchParams message={sp.message} error={sp.error} />

      <form method="get" className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          className="input"
          placeholder="Search all manuals — e.g. Trane XR14"
          aria-label="Search manuals"
        />
        <button type="submit" className="btn-navy">Search</button>
        {q && (
          <Link href={brand ? tabHref(brand, model) : "/portal/manuals"} className="btn-outline">
            Clear
          </Link>
        )}
      </form>

      {brands.length === 0 ? (
        <EmptyState>
          {isAdmin
            ? "No manuals yet. Upload the first one below. Its brand and model become tabs."
            : "No manuals have been uploaded yet."}
        </EmptyState>
      ) : (
        <>
          {/* Brand tabs */}
          <nav aria-label="Brands" className="flex flex-wrap gap-1 border-b-2 border-navy-900">
            {brands.map((b) => {
              const active = !q && b.name === brand;
              return (
                <Link
                  key={b.name}
                  href={tabHref(b.name)}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${
                    active ? "bg-navy-900 text-white" : "bg-white text-navy-700 hover:bg-navy-100"
                  }`}
                >
                  {b.name} <span className="font-normal opacity-70">({b.count})</span>
                </Link>
              );
            })}
          </nav>

          <div className="card rounded-t-none p-5">
            {q ? (
              <p className="mb-3 text-sm text-navy-500">
                {manuals.length} result{manuals.length === 1 ? "" : "s"} for “{q}”
              </p>
            ) : (
              /* Model tabs for the selected brand */
              <nav aria-label={`${brand} models`} className="mb-4 flex flex-wrap gap-2">
                {models.map((m) => {
                  const active = m.name === model;
                  return (
                    <Link
                      key={m.name}
                      href={tabHref(brand!, m.name)}
                      aria-current={active ? "page" : undefined}
                      className={`rounded-full border px-3 py-1 text-sm font-medium ${
                        active
                          ? "border-accent bg-accent text-white"
                          : "border-navy-200 text-navy-700 hover:bg-navy-50"
                      }`}
                    >
                      {m.name} <span className="opacity-70">({m.count})</span>
                    </Link>
                  );
                })}
              </nav>
            )}

            {manuals.length === 0 ? (
              <p className="text-sm text-navy-500">No manuals match.</p>
            ) : (
              <ul className="divide-y divide-navy-100">
                {manuals.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-navy-900">
                          {q ? `${m.brand} ${m.model} — ` : ""}
                          {m.title || m.originalName}
                        </span>
                        <span className="badge bg-navy-100 text-navy-700">{m.equipmentType}</span>
                      </div>
                      <p className="mt-1 text-xs text-navy-400">
                        {fmtSize(m.size)} · uploaded {fmtDate(m.createdAt)}
                        {m.uploadedBy ? ` by ${m.uploadedBy.name}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <a href={`/portal/manuals/${m.id}`} target="_blank" rel="noopener" className="btn-outline btn-sm">
                        Open
                      </a>
                      {isAdmin && (
                        <form action={deleteManual}>
                          <input type="hidden" name="id" value={m.id} />
                          <ConfirmButton message={`Delete "${m.title || m.originalName}" (${m.brand} ${m.model})? It will also be removed from the vans.`}>
                            Delete
                          </ConfirmButton>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {isAdmin && (
        <div className="card mt-6 p-6">
          <h2 className="text-lg font-semibold text-navy-900">Upload a manual</h2>
          <p className="mt-1 text-sm text-navy-500">
            Pick an existing brand and model, or type a new one to create its tab.
          </p>
          <form
            action="/portal/manuals/upload"
            method="post"
            encType="multipart/form-data"
            className="mt-4 grid gap-4 sm:grid-cols-2"
          >
            <div>
              <label className="label" htmlFor="m-brand">Brand</label>
              <input
                id="m-brand"
                name="brand"
                list="manual-brands"
                className="input"
                placeholder="e.g. Carrier"
                defaultValue={q ? "" : brand ?? ""}
                required
              />
              <datalist id="manual-brands">
                {brands.map((b) => <option key={b.name} value={b.name} />)}
              </datalist>
            </div>
            <div>
              <label className="label" htmlFor="m-model">Model number / series</label>
              <input
                id="m-model"
                name="model"
                list="manual-models"
                className="input"
                placeholder="e.g. 24ACC636A003"
                defaultValue={q ? "" : model ?? ""}
                required
              />
              <datalist id="manual-models">
                {models.map((m) => <option key={m.name} value={m.name} />)}
              </datalist>
            </div>
            <div>
              <label className="label" htmlFor="m-type">Equipment type</label>
              <select id="m-type" name="equipmentType" className="input" defaultValue={manuals[0]?.equipmentType ?? "Air Conditioner"}>
                {MANUAL_EQUIPMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="m-title">
                Title <span className="font-normal text-navy-400">(optional)</span>
              </label>
              <input id="m-title" name="title" className="input" placeholder="e.g. Installation manual, Wiring diagram" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="m-file">File (PDF or image, up to 50 MB)</label>
              <input
                id="m-file"
                name="file"
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                className="input"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary">Upload Manual</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
