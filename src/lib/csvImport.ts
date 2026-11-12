/**
 * Reading customer and job lists exported from other software (spreadsheets,
 * QuickBooks, Housecall Pro, Jobber, ServiceTitan, ...). Pure helpers, no
 * database: the admin Import page (src/app/portal/admin/import) uses them.
 *
 * Column names are matched loosely ("Customer Name", "customer_name", "Client"
 * all work), so a file can usually be uploaded as exported.
 */

/** RFC 4180 CSV: quoted fields, "" escapes, commas/newlines inside quotes, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Column aliases (normalized: lowercase, letters and digits only). */
export const CUSTOMER_COLUMNS = {
  name: ["name", "customername", "customer", "client", "clientname", "fullname", "displayname", "contactname", "company", "companyname"],
  firstName: ["firstname", "first", "givenname"],
  lastName: ["lastname", "last", "surname", "familyname"],
  email: ["email", "emailaddress", "customeremail", "clientemail", "primaryemail", "mainemail"],
  phone: ["phone", "phonenumber", "mobile", "mobilephone", "cell", "cellphone", "homephone", "primaryphone", "mainphone", "telephone", "workphone"],
  address: ["address", "serviceaddress", "street", "streetaddress", "address1", "addressline1", "billingaddress", "billingstreet", "location", "fulladdress"],
  city: ["city", "town", "billingcity"],
  state: ["state", "province", "billingstate", "st"],
  zip: ["zip", "zipcode", "postalcode", "postcode", "billingzip"],
} as const;

export const JOB_COLUMNS = {
  ...CUSTOMER_COLUMNS,
  service: ["service", "serviceneeded", "servicerequested", "description", "jobdescription", "jobtype", "title", "jobtitle", "worktype", "summaryofwork", "reason"],
  date: ["date", "scheduleddate", "jobdate", "servicedate", "appointmentdate", "visitdate", "start", "startdate", "scheduledstart", "completeddate", "datecompleted", "appointment", "scheduled"],
  time: ["time", "scheduledtime", "starttime", "appointmenttime", "arrivalwindow", "window", "timeslot"],
  technician: ["technician", "tech", "assignedto", "employee", "assignedtechnician", "techs", "assignedemployees", "teammember", "staff", "servicetech"],
  status: ["status", "jobstatus"],
  summary: ["summary", "notes", "worknotes", "workperformed", "workdone", "completionnotes", "resolution", "comments", "jobnotes", "technotes"],
} as const;

export type ColumnMap<K extends string> = Partial<Record<K, number>>;

/** Finds which column holds what. Exact alias first, then "contains" (e.g. "Customer Email Address"). */
export function mapColumns<K extends string>(header: string[], columns: Record<K, readonly string[]>): ColumnMap<K> {
  const h = header.map(norm);
  const used = new Set<number>();
  const out: ColumnMap<K> = {};
  const keys = Object.keys(columns) as K[];
  for (const key of keys) {
    const idx = h.findIndex((col, i) => !used.has(i) && columns[key].includes(col));
    if (idx >= 0) {
      out[key] = idx;
      used.add(idx);
    }
  }
  // Then partial matches, most specific first: "customerfirstname" contains both
  // "customer" (name) and "firstname"; the longer alias wins.
  const partial: { key: K; col: number; len: number }[] = [];
  for (const key of keys) {
    if (out[key] !== undefined) continue;
    h.forEach((col, i) => {
      if (used.has(i) || col.length <= 2) return;
      for (const a of columns[key]) if (a.length > 3 && col.includes(a)) partial.push({ key, col: i, len: a.length });
    });
  }
  // Longest alias first; on a tie a specific field beats the general "name".
  partial.sort((a, b) => b.len - a.len || Number(a.key === "name") - Number(b.key === "name"));
  for (const p of partial) {
    if (out[p.key] !== undefined || used.has(p.col)) continue;
    out[p.key] = p.col;
    used.add(p.col);
  }
  return out;
}

export function cell<K extends string>(row: string[], map: ColumnMap<K>, key: K): string {
  const i = map[key];
  return i === undefined ? "" : (row[i] ?? "").trim();
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * A calendar day from common formats, as UTC midnight (how the portal stores
 * job days): 4/17/2015, 04-17-15, 2015-04-17, April 17, 2015, 17 Apr 2015,
 * Excel serial numbers. Any time of day after the date is returned separately.
 */
export function parseDay(value: string): { day: Date; time: string | null } | null {
  let s = value.trim();
  if (!s) return null;
  let time: string | null = null;
  const t = /\s+(?:at\s+)?(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)\s*$/i.exec(s) ?? /T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (t) {
    time = formatTime(t[1]);
    s = s.slice(0, t.index).trim().replace(/,$/, "");
  }
  let y: number, m: number, d: number;
  let mm: RegExpExecArray | null;
  if ((mm = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s))) [y, m, d] = [+mm[1], +mm[2], +mm[3]];
  else if ((mm = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s))) {
    [m, d, y] = [+mm[1], +mm[2], +mm[3]];
    if (y < 100) y += y < 70 ? 2000 : 1900;
  } else if ((mm = /^(?:[a-z]+,?\s+)?([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i.exec(s))) {
    m = MONTHS[mm[1].slice(0, mm[1].toLowerCase() === "sept" ? 4 : 3).toLowerCase()];
    [d, y] = [+mm[2], +mm[3]];
  } else if ((mm = /^(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})$/i.exec(s))) {
    m = MONTHS[mm[2].slice(0, 3).toLowerCase()];
    [d, y] = [+mm[1], +mm[3]];
  } else if (/^\d{5}(\.\d+)?$/.test(s)) {
    // Excel serial day (1900 system).
    const ms = Date.UTC(1899, 11, 30) + Math.floor(+s) * 86_400_000;
    const dt = new Date(ms);
    [y, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  } else return null;
  if (!m || m < 1 || m > 12 || d < 1 || d > 31 || y < 1950 || y > 2100) return null;
  const day = new Date(Date.UTC(y, m - 1, d));
  if (day.getUTCMonth() !== m - 1) return null; // e.g. 2/30
  return { day, time };
}

/** "14:30" / "2:30pm" / "2:30 PM" -> "2:30 PM"; anything else is kept as written. */
export function formatTime(value: string): string {
  const s = value.trim();
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?m?\.?$/i.exec(s);
  if (!m) return s.slice(0, 40);
  let h = +m[1];
  const min = m[2];
  let ap = m[3]?.toLowerCase();
  if (!ap) {
    ap = h >= 12 ? "p" : "a";
    h = h % 12 || 12;
  } else if (h === 0 || h > 12) return s.slice(0, 40);
  return `${h}:${min} ${ap === "p" ? "PM" : "AM"}`;
}

export type ImportStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

/** Status from the file, or from the date when the file has none: past = Completed. */
export function parseStatus(value: string, day: Date, today = new Date()): ImportStatus {
  const s = value.trim().toLowerCase();
  if (/cancel|void|declin|no.?show|lost/.test(s)) return "CANCELLED";
  if (/complet|done|finish|closed|paid|invoiced|archiv/.test(s)) return "COMPLETED";
  if (/progress|started|working|en.?route|on.?site|active/.test(s)) return "IN_PROGRESS";
  if (/sched|book|upcoming|open|pending|new|unscheduled|assigned/.test(s)) return "SCHEDULED";
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return day.getTime() < startOfToday ? "COMPLETED" : "SCHEDULED";
}

export const isEmail = (s: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s);

/** Full name from a "Name" column or First + Last columns. */
export function personName<K extends "name" | "firstName" | "lastName">(row: string[], map: ColumnMap<K>): string {
  const full = cell(row, map, "name" as K);
  if (full) return full.replace(/\s+/g, " ").slice(0, 160);
  return [cell(row, map, "firstName" as K), cell(row, map, "lastName" as K)].filter(Boolean).join(" ").slice(0, 160);
}

/** "12 Main St" + city/state/zip columns -> "12 Main St, Fulton, MD 20759". */
export function fullAddress<K extends "address" | "city" | "state" | "zip">(row: string[], map: ColumnMap<K>): string {
  const street = cell(row, map, "address" as K).replace(/\s*\n\s*/g, ", ");
  const city = cell(row, map, "city" as K);
  const stateZip = [cell(row, map, "state" as K), cell(row, map, "zip" as K)].filter(Boolean).join(" ");
  const parts = [street];
  if (city && !street.toLowerCase().includes(city.toLowerCase())) parts.push(city);
  if (stateZip && !street.includes(stateZip)) parts.push(stateZip);
  return parts.filter(Boolean).join(", ").slice(0, 400);
}
