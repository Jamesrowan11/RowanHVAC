import { db } from "@/lib/db";
import type { ServiceTicket, TicketLineItem } from "@prisma/client";

/**
 * Ticket pricing is a LOOKUP TABLE, not an hourly formula: duration rounds UP
 * to the nearest bracket (15-min steps, 30-min minimum by default) and the
 * price comes from the LaborRate row for (zone, bracket). Add-ons and the
 * rounding rules themselves are admin-editable Settings — nothing here is a
 * hardcoded dollar amount.
 *
 * Everything returned is a preview until submit, when the caller freezes the
 * computed lines onto the ticket. Past tickets never change with the book.
 */

export type PricingSettings = {
  ladderFee: number;
  maintenanceRate: number;
  twoTechMultiplier: number;
  roundToMinutes: number;
  minimumMinutes: number;
  maxMinutes: number;
};

const SETTING_DEFAULTS: Record<string, number> = {
  "pricing.ladderFee": 50,
  "pricing.maintenanceRate": 489,
  "pricing.twoTechMultiplier": 2,
  "pricing.roundToMinutes": 15,
  "pricing.minimumMinutes": 30,
  "pricing.maxMinutes": 360,
};

export async function getPricingSettings(): Promise<PricingSettings> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: "pricing." } } });
  const get = (key: string) => {
    const raw = rows.find((r) => r.key === key)?.value;
    const n = raw !== undefined ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : SETTING_DEFAULTS[key];
  };
  return {
    ladderFee: get("pricing.ladderFee"),
    maintenanceRate: get("pricing.maintenanceRate"),
    twoTechMultiplier: get("pricing.twoTechMultiplier"),
    roundToMinutes: get("pricing.roundToMinutes"),
    minimumMinutes: get("pricing.minimumMinutes"),
    maxMinutes: get("pricing.maxMinutes"),
  };
}

export type PricingLine = {
  kind: "LABOR" | "ADDON" | "PART";
  label: string;
  qty?: number;
  unitPrice?: number;
  amount: number;
};

export type PricingResult = {
  lines: PricingLine[];
  laborTotal: number;
  partsTotal: number;
  total: number;
  needsManualPricing: boolean;
  /** Human-readable reasons pricing couldn't fully resolve. */
  problems: string[];
  /** Rounded billing bracket in minutes (null when not applicable). */
  bracketMinutes: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function fmtBracket(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Round a raw duration up to the billing bracket. */
export function roundToBracket(rawMinutes: number, s: PricingSettings): number {
  const floored = Math.max(rawMinutes, s.minimumMinutes);
  return Math.ceil(floored / s.roundToMinutes) * s.roundToMinutes;
}

type TicketForPricing = Pick<
  ServiceTicket,
  "timeIn" | "timeOut" | "zone" | "techCount" | "ladderUsed" | "maintenanceVisit" | "billingStatus"
> & { lineItems: TicketLineItem[] };

export async function computeTicketPricing(ticket: TicketForPricing): Promise<PricingResult> {
  const s = await getPricingSettings();
  const problems: string[] = [];
  const lines: PricingLine[] = [];
  let needsManualPricing = false;
  let bracketMinutes: number | null = null;

  // No Charge: total is $0, full stop. Parts/labor aren't billed.
  if (ticket.billingStatus === "NO_CHARGE") {
    return { lines: [], laborTotal: 0, partsTotal: 0, total: 0, needsManualPricing: false, problems: [], bracketMinutes: null };
  }

  // --- Labor -----------------------------------------------------------
  let laborTotal = 0;
  if (ticket.maintenanceVisit) {
    laborTotal = s.maintenanceRate;
    lines.push({ kind: "LABOR", label: "Maintenance policy visit (flat rate)", amount: round2(laborTotal) });
  } else if (ticket.timeIn && ticket.timeOut) {
    const rawMinutes = (ticket.timeOut.getTime() - ticket.timeIn.getTime()) / 60000;
    if (rawMinutes <= 0) {
      problems.push("Time out must be after time in.");
    } else if (!ticket.zone) {
      problems.push("Pick a zone (Local Areas or DC) to price labor.");
    } else {
      bracketMinutes = roundToBracket(rawMinutes, s);
      if (bracketMinutes > s.maxMinutes) {
        needsManualPricing = true;
        problems.push(
          `Duration (${fmtBracket(bracketMinutes)}) is beyond the labor table (${fmtBracket(s.maxMinutes)} max) — flagged for manual pricing.`
        );
      } else {
        const rate = await db.laborRate.findUnique({
          where: { zone_minutes: { zone: ticket.zone, minutes: bracketMinutes } },
        });
        if (!rate) {
          needsManualPricing = true;
          problems.push(`No labor rate for ${ticket.zone} at ${fmtBracket(bracketMinutes)} — flagged for manual pricing.`);
        } else if (ticket.techCount >= 2) {
          laborTotal = rate.twoTechPrice ? Number(rate.twoTechPrice) : Number(rate.price) * s.twoTechMultiplier;
          lines.push({
            kind: "LABOR",
            label: `Labor — ${ticket.zone}, ${fmtBracket(bracketMinutes)}, 2 technicians`,
            amount: round2(laborTotal),
          });
        } else {
          laborTotal = Number(rate.price);
          lines.push({
            kind: "LABOR",
            label: `Labor — ${ticket.zone}, ${fmtBracket(bracketMinutes)}`,
            amount: round2(laborTotal),
          });
        }
      }
    }
  } else {
    problems.push("Enter time in and time out to price labor.");
  }

  // --- Add-ons ----------------------------------------------------------
  if (ticket.ladderUsed && s.ladderFee > 0) {
    lines.push({ kind: "ADDON", label: "Ladder", amount: round2(s.ladderFee) });
    laborTotal += s.ladderFee;
  }

  // --- Parts (already snapshotted as PART line items on the ticket) ------
  let partsTotal = 0;
  for (const li of ticket.lineItems.filter((l) => l.kind === "PART")) {
    const amount = Number(li.amount);
    partsTotal += amount;
    lines.push({
      kind: "PART",
      label: li.label,
      qty: li.qty ? Number(li.qty) : undefined,
      unitPrice: li.unitPrice ? Number(li.unitPrice) : undefined,
      amount: round2(amount),
    });
  }

  return {
    lines,
    laborTotal: round2(laborTotal),
    partsTotal: round2(partsTotal),
    total: round2(laborTotal + partsTotal),
    needsManualPricing,
    problems,
    bracketMinutes,
  };
}
