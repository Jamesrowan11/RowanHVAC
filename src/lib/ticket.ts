import { z } from "zod";
import layoutJson from "../../van-app/rowanvan/ticket_layout.json";
import maintenanceLayoutJson from "../../van-app/rowanvan/maintenance_layout.json";

/**
 * Service tickets written on the van terminals (van-app/rowanvan/ticket.py).
 * The sheet layout is ONE file, van-app/rowanvan/ticket_layout.json, shared by
 * the van's live preview and the PDF printed here — regenerate it with
 * `python3 van-app/tools/build_ticket_layout.py`.
 *
 * Pure helpers only (no Prisma) so they are easy to unit test. The money maths
 * mirrors ticket.py exactly; the server always recomputes the totals rather
 * than trusting the van's.
 */

export type LayoutElement =
  | { t: "rect"; x: number; y: number; w: number; h: number; lw?: number; fill?: string | null }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; lw?: number }
  | {
      t: "text";
      x: number;
      y: number;
      s: string;
      size: number;
      bold?: boolean;
      align?: "left" | "center" | "right";
      w?: number;
      color?: string;
    }
  | {
      t: "field";
      id: string;
      x: number;
      y: number;
      w: number;
      h: number;
      kind: FieldKind;
      // kind "status": one choice, drawn as a tick in the box for that choice
      boxes?: Record<string, number>;
      size?: number;
      align?: "left" | "center" | "right";
      lh?: number;
      computed?: boolean;
    };

export type FieldKind = "text" | "multi" | "check" | "money" | "status";
export type LayoutField = {
  id: string;
  label: string;
  kind: FieldKind;
  hint?: string;
  computed?: boolean;
  choices?: [string, string][];
};
export type TicketLayout = {
  version: number;
  page: { w: number; h: number };
  elements: LayoutElement[];
  sections: { title: string; fields: LayoutField[] }[];
};

export const ticketLayout = layoutJson as unknown as TicketLayout;

export const TICKET_FIELDS: Map<string, LayoutField> = new Map(
  ticketLayout.sections.flatMap((s) => s.fields.map((f) => [f.id, f] as const)),
);

/**
 * The two sheets a van can fill in: the service ticket, and the preventive
 * maintenance inspection report used on maintenance-agreement visits
 * (van-app/tools/build_maintenance_layout.py).
 */
export const SHEET_KINDS = ["service", "maintenance"] as const;
export type SheetKind = (typeof SHEET_KINDS)[number];
export const SHEET_NAMES: Record<SheetKind, string> = { service: "Service Ticket", maintenance: "Maintenance Report" };

const LAYOUTS: Record<SheetKind, TicketLayout> = {
  service: ticketLayout,
  maintenance: maintenanceLayoutJson as unknown as TicketLayout,
};
const FIELDS: Record<SheetKind, Map<string, LayoutField>> = {
  service: TICKET_FIELDS,
  maintenance: new Map(LAYOUTS.maintenance.sections.flatMap((s) => s.fields.map((f) => [f.id, f] as const))),
};

export function sheetKind(value: unknown): SheetKind {
  return value === "maintenance" ? "maintenance" : "service";
}
export const layoutFor = (kind: SheetKind) => LAYOUTS[kind];
export const fieldsFor = (kind: SheetKind) => FIELDS[kind];

/** Any field values as sent by a van; cleaned per sheet with cleanTicketData. */
export const rawTicketDataSchema = z
  .record(z.string().max(40), z.union([z.string().max(5000), z.boolean()]))
  .refine((d) => Object.keys(d).length <= 300, "Too many fields");

/** Keeps only this sheet's fields, with the right type for each. */
export function cleanTicketData(kind: SheetKind, d: Record<string, string | boolean>): TicketData {
  const fields = FIELDS[kind];
  const clean: TicketData = {};
  for (const [k, v] of Object.entries(d)) {
    const f = fields.get(k);
    if (!f) continue;
    if (f.kind === "check") clean[k] = v === true || v === "true" || v === "1";
    else if (typeof v !== "string") continue;
    else if (f.kind === "status") {
      if (f.choices?.some(([key]) => key === v)) clean[k] = v;
    } else clean[k] = f.kind === "multi" ? v : v.replace(/[\r\n]+/g, " ");
  }
  return kind === "service" ? withTotals(clean) : clean;
}

export const PART_ROWS = 8;
export const MONEY_INPUTS = ["reg_labor", "overtime_labor", "trip_charges", "previous", "coupon", "fuel_charge"] as const;
export const COMPUTED = ["total_parts", "refrigerant_charge", "subtotal", "total_due"] as const;

export type TicketData = Record<string, string | boolean>;

/** Ticket contents as sent by a van: only known fields, bounded sizes. */
export const ticketDataSchema = z
  .record(z.string().max(40), z.union([z.string().max(5000), z.boolean()]))
  .refine((d) => Object.keys(d).length <= 300, "Too many fields")
  .transform((d) => {
    const clean: TicketData = {};
    for (const [k, v] of Object.entries(d)) {
      if (!TICKET_FIELDS.has(k)) continue;
      const kind = TICKET_FIELDS.get(k)!.kind;
      if (kind === "check") clean[k] = v === true || v === "true" || v === "1";
      else if (typeof v === "string") clean[k] = kind === "multi" ? v : v.replace(/[\r\n]+/g, " ");
    }
    return clean;
  });

const REFRIGERANT_RE = /refrigerant|\br-?\s?\d{2,3}[a-z]?\b|\bfreon\b|\bpuron\b/i;

export function isRefrigerant(description: string | undefined): boolean {
  return REFRIGERANT_RE.test(description ?? "");
}

/** "$1,234.50" -> 1234.5; "" -> 0; garbage -> null. */
export function parseMoney(value: unknown): number | null {
  const s = String(typeof value === "string" ? value : "").trim().replace(/[$,]/g, "");
  if (!s) return 0;
  if (!/^-?\d+(\.\d+)?$|^-?\.\d+$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100) / 100;
}

const money = (n: number) => n.toFixed(2);

/** The calculated money lines (same rules as ticket.py `compute`). */
export function computeTotals(data: TicketData) {
  let parts = 0;
  let refrigerant = 0;
  for (let row = 1; row <= PART_ROWS; row++) {
    const amount = parseMoney(data[`part${row}_amount`]);
    if (!amount) continue;
    if (isRefrigerant(String(data[`part${row}_desc`] ?? ""))) refrigerant += amount;
    else parts += amount;
  }
  const m = Object.fromEntries(MONEY_INPUTS.map((k) => [k, parseMoney(data[k]) ?? 0])) as Record<
    (typeof MONEY_INPUTS)[number],
    number
  >;
  const subtotal = m.reg_labor + m.overtime_labor + parts + m.trip_charges + refrigerant;
  const total = subtotal + m.previous - m.coupon + m.fuel_charge;
  return {
    total_parts: money(parts),
    refrigerant_charge: money(refrigerant),
    subtotal: money(subtotal),
    total_due: money(total),
  };
}

export function withTotals(data: TicketData): TicketData {
  return { ...data, ...computeTotals(data) };
}

export function fieldLabel(id: string, kind: SheetKind = "service"): string {
  return FIELDS[kind].get(id)?.label ?? id;
}

export type TicketIssue = {
  field: string;
  severity: "error" | "warning" | "suggestion";
  message: string;
};

/**
 * The ticket as plain text for the AI, section by section, with the printed
 * labels (so it reads like the paper form) and the field id in brackets (so
 * issues can point back at the exact box on the sheet).
 */
export function ticketAsText(data: TicketData, kind: SheetKind = "service"): string {
  const lines: string[] = [];
  for (const section of LAYOUTS[kind].sections) {
    const filled = section.fields.filter((f) => {
      const v = data[f.id];
      return f.kind === "check" ? v === true : typeof v === "string" && v.trim() !== "";
    });
    lines.push(`## ${section.title}`);
    if (!filled.length) {
      lines.push("(nothing filled in)");
      continue;
    }
    for (const f of filled) {
      const v = data[f.id];
      const shown =
        f.kind === "check" ? "ticked" : f.kind === "status" ? f.choices?.find(([k]) => k === v)?.[1] ?? String(v) : String(v);
      lines.push(`[${f.id}] ${f.label}: ${shown}`);
    }
  }
  return lines.join("\n");
}

/** Only issues that point at a real box on the sheet are kept. */
export function cleanIssues(issues: TicketIssue[], kind: SheetKind = "service"): TicketIssue[] {
  const seen = new Set<string>();
  const out: TicketIssue[] = [];
  for (const i of issues) {
    const field = FIELDS[kind].has(i.field) ? i.field : "work_description";
    const key = `${field}|${i.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ field, severity: i.severity, message: i.message.slice(0, 500) });
  }
  return out.slice(0, 40);
}
