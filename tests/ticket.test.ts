import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  cleanIssues,
  computeTotals,
  ticketAsText,
  ticketDataSchema,
  ticketLayout,
  TICKET_FIELDS,
  type TicketData,
} from "@/lib/ticket";
import { renderTicketPdf, winAnsi } from "@/lib/ticketPdf";
import { parseOp } from "@/lib/vanSync";

// The paper ticket the office sent as the example (JB4-17-2015).
export const SAMPLE: TicketData = {
  invoice_no: "JB4-17-2015", date: "April 17, 2015", time_in: "10:00 AM", time_out: "2:15 PM",
  cust_name: "Ed Joholske", cust_street: "11394 Liberty Street", cust_city: "Fulton, MD 20759",
  cust_phone: "301-642-5733", job_finished: true, pay_cod: true,
  service_requested: "check system heating and a/c top floor",
  filter_size: "16x25x4", superheat: "10", superheat_ok: true, subcool: "13", subcool_ok: true,
  evap_ent_lvg: "63/41", comp_volts: "240", co_ppm: "4", refrigerant_type: "R-410A",
  work_description:
    "Filter is clean, blower capacitor is good, indoor coil is clean, ignitor is good. I started the heat, " +
    "I found that the furnace is creating dangerous levels of CO, this is due to no make up air for the " +
    "furnace. I recommend installing outdoor make up air damper to fix problem.",
  technician: "Juan Brenes", eq1_location: "top floor", eq1_make: "carrier", eq1_model: "58sta045-12108",
  eq1_serial: "2106a045-08", eq1_type: "80% Furnace", eqt_gas_heat: true,
  part1_qty: "2 LBS", part1_desc: "R-410A REFRIGERANT $49.00/LB", part1_amount: "98.00",
  part2_qty: "1", part2_desc: "7.5mf 370V Capacitor", part2_amount: "35.00",
  reg_labor: "479.00", fuel_charge: "10.00",
};

describe("service ticket totals (same rules as the van's ticket.py)", () => {
  it("matches the paper ticket", () => {
    expect(computeTotals(SAMPLE)).toEqual({
      total_parts: "35.00", refrigerant_charge: "98.00", subtotal: "612.00", total_due: "622.00",
    });
  });
  it("applies previous balance and coupon, ignores junk", () => {
    expect(computeTotals({ ...SAMPLE, previous: "$1,000.00", coupon: "50", part3_amount: "abc" }).total_due).toBe(
      "1572.00",
    );
  });
});

describe("ticket data from a van", () => {
  it("keeps only known fields and normalises checkboxes", () => {
    const parsed = ticketDataSchema.parse({ cust_name: "A\nB", pay_cod: "true", hacker: "x", work_description: "a\nb" });
    expect(parsed).toEqual({ cust_name: "A B", pay_cod: true, work_description: "a\nb" });
  });
  it("accepts a ticket.save op", () => {
    const r = parseOp({
      opId: "o1", type: "ticket.save", id: "van_" + "a".repeat(32), jobId: "job1",
      invoiceNumber: "JB4-17-2015", status: "final", data: SAMPLE, savedAt: "2026-11-11T12:00:00.000Z",
      aiCheck: { issues: [{ field: "time_out", severity: "warning", message: "x" }], summary: "ok" },
    });
    expect("op" in r && r.op.type).toBe("ticket.save");
  });
  it("rejects a malformed ticket id", () => {
    const r = parseOp({ opId: "o1", type: "ticket.save", id: "1", jobId: "j", invoiceNumber: "", status: "draft", data: {}, savedAt: "2026-11-11T12:00:00.000Z" });
    expect("result" in r).toBe(true);
  });
});

describe("AI helpers", () => {
  it("lists fields with their ids for the AI", () => {
    const text = ticketAsText(SAMPLE);
    expect(text).toContain("[superheat] ");
    expect(text).toContain("[job_finished] ");
    expect(text).toContain(": ticked");
  });
  it("points unknown fields at the description and drops duplicates", () => {
    const out = cleanIssues([
      { field: "nope", severity: "warning", message: "m" },
      { field: "nope", severity: "warning", message: "m" },
      { field: "co_ppm", severity: "error", message: "CO" },
    ]);
    expect(out).toEqual([
      { field: "work_description", severity: "warning", message: "m" },
      { field: "co_ppm", severity: "error", message: "CO" },
    ]);
  });
});

describe("ticket PDF", () => {
  it("every drawn field is listed in a section", () => {
    const drawn = ticketLayout.elements.filter((e) => e.t === "field").map((e) => (e as { id: string }).id);
    expect(new Set(drawn)).toEqual(new Set(TICKET_FIELDS.keys()));
  });
  it("renders one landscape page, two when the description runs long", async () => {
    const one = await PDFDocument.load(await renderTicketPdf(SAMPLE));
    expect(one.getPageCount()).toBe(1);
    expect(one.getPage(0).getSize()).toEqual({ width: 792, height: 612 });
    const long = await PDFDocument.load(
      await renderTicketPdf({ ...SAMPLE, work_description: "Checked the system and cleaned the coil. ".repeat(80) }),
    );
    expect(long.getPageCount()).toBe(2);
  });
  it("survives characters the PDF fonts cannot draw", async () => {
    expect(winAnsi("“63°/41°” — ok ✓")).toBe('"63°/41°" - ok ');
    await renderTicketPdf({ ...SAMPLE, cust_name: "Zoë 李 ✓", work_description: "Tab\there" });
  });
});
