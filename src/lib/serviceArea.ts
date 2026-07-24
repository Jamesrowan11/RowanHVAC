/**
 * Service-area data + eligibility check. The matching functions are pure and
 * take their data as an argument, so they run client-side (instant, no API)
 * with whatever towns/ZIPs the admin has configured in the database.
 *
 * DEFAULT_AREAS is the seed/fallback set — used when the database has no
 * service areas configured yet.
 */

export type AreaTown = { region: string; town: string; zips: string[] };

export const DEFAULT_AREAS: AreaTown[] = [
  // Howard County
  { region: "Howard County", town: "Clarksville", zips: ["21029"] },
  { region: "Howard County", town: "Columbia", zips: ["21044", "21045", "21046"] },
  { region: "Howard County", town: "Dayton", zips: ["21036"] },
  { region: "Howard County", town: "Elkridge", zips: ["21075"] },
  { region: "Howard County", town: "Ellicott City", zips: ["21042", "21043"] },
  { region: "Howard County", town: "Fulton", zips: ["20759"] },
  { region: "Howard County", town: "Glenelg", zips: ["21737"] },
  { region: "Howard County", town: "Highland", zips: ["20777"] },
  { region: "Howard County", town: "Jessup", zips: ["20794"] },
  { region: "Howard County", town: "Laurel", zips: ["20707", "20708", "20723", "20724"] },
  { region: "Howard County", town: "Lisbon", zips: ["21765"] },
  { region: "Howard County", town: "Maple Lawn", zips: ["20759"] },
  { region: "Howard County", town: "Woodbine", zips: ["21797"] },

  // Within ~10 miles of Ellicott City (Baltimore & Carroll County edges)
  { region: "Near Ellicott City", town: "Catonsville", zips: ["21228", "21250"] },
  { region: "Near Ellicott City", town: "Arbutus / Halethorpe", zips: ["21227"] },
  { region: "Near Ellicott City", town: "Woodstock", zips: ["21163"] },
  { region: "Near Ellicott City", town: "Marriottsville", zips: ["21104"] },
  { region: "Near Ellicott City", town: "West Friendship", zips: ["21794"] },
  { region: "Near Ellicott City", town: "Cooksville", zips: ["21723"] },
  { region: "Near Ellicott City", town: "Glenwood", zips: ["21738"] },
  { region: "Near Ellicott City", town: "Randallstown", zips: ["21133"] },
  { region: "Near Ellicott City", town: "Windsor Mill", zips: ["21244"] },
  { region: "Near Ellicott City", town: "Owings Mills", zips: ["21117"] },
  { region: "Near Ellicott City", town: "Pikesville", zips: ["21208"] },
  { region: "Near Ellicott City", town: "Sykesville / Eldersburg", zips: ["21784"] },
  { region: "Near Ellicott City", town: "Savage", zips: ["20763"] },
  { region: "Near Ellicott City", town: "Hanover", zips: ["21076"] },
  { region: "Near Ellicott City", town: "Severn", zips: ["21144"] },

  // Montgomery County
  { region: "Montgomery County", town: "Bethesda", zips: ["20814", "20816", "20817"] },
  { region: "Montgomery County", town: "Burtonsville", zips: ["20866"] },
  { region: "Montgomery County", town: "Gaithersburg", zips: ["20877", "20878", "20879"] },
  { region: "Montgomery County", town: "Germantown", zips: ["20874", "20876"] },
  { region: "Montgomery County", town: "Montgomery Village", zips: ["20886"] },
  { region: "Montgomery County", town: "Potomac", zips: ["20854"] },
  { region: "Montgomery County", town: "Rockville", zips: ["20850", "20851", "20852", "20853", "20855"] },
  { region: "Montgomery County", town: "Silver Spring", zips: ["20901", "20902", "20903", "20904", "20905", "20906", "20910"] },
  { region: "Montgomery County", town: "Takoma Park", zips: ["20912"] },

  // Prince George's County & nearby
  { region: "Prince George's County & nearby", town: "Beltsville", zips: ["20705"] },
  { region: "Prince George's County & nearby", town: "Bowie", zips: ["20715", "20716", "20720", "20721"] },
  { region: "Prince George's County & nearby", town: "College Park", zips: ["20740", "20742"] },
  { region: "Prince George's County & nearby", town: "Crofton", zips: ["21114"] },
  { region: "Prince George's County & nearby", town: "Greenbelt", zips: ["20770"] },
  { region: "Prince George's County & nearby", town: "Hyattsville", zips: ["20781", "20782", "20783", "20784", "20785"] },
  { region: "Prince George's County & nearby", town: "Suitland", zips: ["20746"] },

  // Washington, DC (matched by ZIP range + name, not the quadrant labels)
  { region: "Washington, DC", town: "NW · NE · SE · SW (all quadrants)", zips: [] },
];

export type AreaData = { zips: string[]; towns: string[] };

/** Flatten configured towns into the lookup data the checker needs. */
export function buildAreaData(areas: { town: string; zips: string[] }[]): AreaData {
  const zips = new Set<string>();
  const towns = new Set<string>();
  for (const a of areas) {
    a.zips.forEach((z) => zips.add(z.trim()));
    // Split combined labels like "Arbutus / Halethorpe" into matchable names.
    a.town.split(/[/·]/).forEach((part) => {
      const t = part.trim().toLowerCase();
      if (t.length > 3) towns.add(t);
    });
  }
  return { zips: [...zips], towns: [...towns] };
}

export type AreaCheckResult = "covered" | "outside" | "unknown";

export function checkServiceArea(input: string, data: AreaData): AreaCheckResult {
  const text = input.toLowerCase().trim();
  if (!text) return "unknown";

  const zipSet = new Set(data.zips);
  const zips = text.match(/\b\d{5}\b/g) ?? [];
  for (const zip of zips) {
    if (zipSet.has(zip)) return "covered";
    const n = parseInt(zip, 10);
    // Washington, DC: 200xx residential, 202xx–205xx federal.
    if ((n >= 20001 && n <= 20099) || (n >= 20201 && n <= 20599)) return "covered";
  }

  if (data.towns.some((town) => new RegExp(`\\b${town.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text))) {
    return "covered";
  }
  if (/washington[, ]+d\.?c\.?|\bdc\b/.test(text)) return "covered";

  if (zips.length > 0) return "outside";
  return "unknown";
}

/** Group towns by region (preserving first-seen order) for display. */
export function groupByRegion(areas: AreaTown[]): { region: string; towns: string[] }[] {
  const order: string[] = [];
  const map = new Map<string, string[]>();
  for (const a of areas) {
    if (!map.has(a.region)) {
      map.set(a.region, []);
      order.push(a.region);
    }
    map.get(a.region)!.push(a.town);
  }
  return order.map((region) => ({ region, towns: map.get(region)! }));
}
