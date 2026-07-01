import { db } from "@/lib/db";
import { COMPANY } from "@/lib/constants";
import { DEFAULT_AREAS, type AreaTown } from "@/lib/serviceArea";

/**
 * Editable website content. Each field is stored as a Setting row keyed
 * `content.<field>`; anything not overridden falls back to the defaults
 * below, so the site always renders even before the admin edits anything.
 */

export type SiteContent = {
  heroHeadline: string;
  heroSubheading: string;
  ctaLabel: string;
  servicesBrandLine: string;
  serviceAreaIntro: string;
  footerTagline: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
  contactHours: string;
};

export const CONTENT_DEFAULTS: SiteContent = {
  heroHeadline: "Reliable Heating & Cooling for Highland and Howard County",
  heroSubheading:
    "Family-owned and operated in Howard County since 1958 — honest, dependable heating and cooling you can trust.",
  ctaLabel: "Request a Service",
  servicesBrandLine: "We service and install Trane, Carrier, and WaterFurnace systems.",
  serviceAreaIntro:
    "Based in Howard County and proudly serving homes across central Maryland and Washington, DC — plus some surrounding areas.",
  footerTagline: "Reliable, honest HVAC service for Highland and Howard County, Maryland.",
  contactPhone: COMPANY.phone,
  contactEmail: COMPANY.email,
  contactAddress: COMPANY.address,
  contactHours: COMPANY.hours,
};

export const CONTENT_FIELDS: { key: keyof SiteContent; label: string; multiline?: boolean }[] = [
  { key: "heroHeadline", label: "Hero headline" },
  { key: "heroSubheading", label: "Hero subheading", multiline: true },
  { key: "ctaLabel", label: "Main button text (e.g. Request a Service)" },
  { key: "servicesBrandLine", label: "Brands line (under Services)" },
  { key: "serviceAreaIntro", label: "Service area intro", multiline: true },
  { key: "footerTagline", label: "Footer tagline", multiline: true },
  { key: "contactPhone", label: "Contact phone (shown on site)" },
  { key: "contactEmail", label: "Contact email (shown on site)" },
  { key: "contactAddress", label: "Mailing address" },
  { key: "contactHours", label: "Business hours" },
];

/** Hero background photo (stored in Setting rows outside the content.* text fields). */
export async function getHeroImage(): Promise<{ path: string; mime: string } | null> {
  const rows = await db.setting.findMany({
    where: { key: { in: ["heroImagePath", "heroImageMime"] } },
  });
  const path = rows.find((r) => r.key === "heroImagePath")?.value;
  const mime = rows.find((r) => r.key === "heroImageMime")?.value;
  return path ? { path, mime: mime || "image/jpeg" } : null;
}

export async function getSiteContent(): Promise<SiteContent> {
  const rows = await db.setting.findMany({
    where: { key: { startsWith: "content." } },
  });
  const overrides: Partial<SiteContent> = {};
  for (const row of rows) {
    const field = row.key.slice("content.".length) as keyof SiteContent;
    if (field in CONTENT_DEFAULTS && row.value.trim()) {
      overrides[field] = row.value;
    }
  }
  return { ...CONTENT_DEFAULTS, ...overrides };
}

/** Active service areas from the DB, or the defaults if none configured yet. */
export async function getServiceAreas(): Promise<AreaTown[]> {
  const rows = await db.serviceArea.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { region: "asc" }, { town: "asc" }],
  });
  if (rows.length === 0) return DEFAULT_AREAS;
  return rows.map((r) => ({
    region: r.region,
    town: r.town,
    zips: r.zips.split(/[\s,]+/).filter(Boolean),
  }));
}
