/**
 * Service-area data + eligibility check. Pure functions — used by the
 * client-side checker on the public site, so no API keys or geocoding
 * service needed. Matching is by ZIP code first, city name second.
 */

export const SERVICE_AREAS: { region: string; cities: string[] }[] = [
  {
    region: "Howard County",
    cities: [
      "Clarksville", "Columbia", "Dayton", "Elkridge", "Ellicott City",
      "Fulton", "Glenelg", "Highland", "Jessup", "Laurel", "Lisbon",
      "Maple Lawn", "Woodbine",
    ],
  },
  {
    region: "Montgomery County",
    cities: [
      "Bethesda", "Burtonsville", "Gaithersburg", "Germantown",
      "Montgomery Village", "Potomac", "Rockville", "Silver Spring",
      "Takoma Park",
    ],
  },
  {
    region: "Prince George's County & nearby",
    cities: [
      "Beltsville", "Bowie", "College Park", "Crofton", "Greenbelt",
      "Hyattsville", "Suitland",
    ],
  },
  {
    region: "Washington, DC",
    cities: ["NW", "NE", "SE", "SW — all quadrants"],
  },
];

/** ZIP codes for the towns above. */
const SERVICE_ZIPS = new Set<string>([
  // Howard County
  "21029",                                // Clarksville
  "21044", "21045", "21046",              // Columbia
  "21036",                                // Dayton
  "21075",                                // Elkridge
  "21042", "21043",                       // Ellicott City
  "20759",                                // Fulton / Maple Lawn
  "21737",                                // Glenelg
  "20777",                                // Highland
  "20794",                                // Jessup
  "20707", "20708", "20709", "20723", "20724", // Laurel
  "21765",                                // Lisbon
  "21797",                                // Woodbine
  // Montgomery County
  "20814", "20815", "20816", "20817",     // Bethesda / Chevy Chase
  "20866",                                // Burtonsville
  "20877", "20878", "20879", "20886",     // Gaithersburg / Montgomery Village
  "20874", "20876",                       // Germantown
  "20854",                                // Potomac
  "20850", "20851", "20852", "20853", "20855", // Rockville
  "20901", "20902", "20903", "20904", "20905", "20906", "20910", // Silver Spring
  "20912",                                // Takoma Park
  // Prince George's & nearby
  "20705",                                // Beltsville
  "20715", "20716", "20720", "20721",     // Bowie
  "20740", "20742",                       // College Park
  "21114",                                // Crofton
  "20770",                                // Greenbelt
  "20781", "20782", "20783", "20784", "20785", // Hyattsville
  "20746",                                // Suitland
]);

// Real town names only — DC quadrant tokens (NW/NE/SE/SW) are too short to
// match safely and are handled by the DC ZIP range + "washington/dc" regex.
const CITY_PATTERNS = SERVICE_AREAS.flatMap((a) => a.cities)
  .map((c) => c.toLowerCase())
  .filter((c) => c.length > 3 && !c.includes("—"))
  .map((c) => new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));

export type AreaCheckResult = "covered" | "outside" | "unknown";

export function checkServiceArea(input: string): AreaCheckResult {
  const text = input.toLowerCase().trim();
  if (!text) return "unknown";

  // ZIP match is most reliable. DC proper is 20001–20099.
  const zips = text.match(/\b\d{5}\b/g) ?? [];
  for (const zip of zips) {
    if (SERVICE_ZIPS.has(zip)) return "covered";
    const n = parseInt(zip, 10);
    // Washington, DC: 200xx residential, 202xx–205xx federal (201xx is VA).
    if ((n >= 20001 && n <= 20099) || (n >= 20201 && n <= 20599)) return "covered";
  }

  // City-name match (whole words only).
  if (CITY_PATTERNS.some((re) => re.test(text))) return "covered";
  if (/washington[, ]+d\.?c\.?|\bdc\b/.test(text)) return "covered";

  // A ZIP was given but didn't match anything we serve.
  if (zips.length > 0) return "outside";

  // No ZIP and no recognizable city — we can't tell.
  return "unknown";
}
