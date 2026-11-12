import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  cleanTicketData,
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

describe("maintenance reports", () => {
  const PM: Record<string, string | boolean> = {
    invoice_no: "JM11-12-2026-PM", date: "November 12, 2026", time_in: "6:00 PM", time_out: "7:30 PM",
    cust_name: "Ann Lee", cust_street: "1 Oak St", cust_city: "Fulton, MD 20759", visit_fall: true,
    agreement: "Comfort Club, renews 05/2027", eq1_location: "Basement", eq1_make: "Carrier",
    eq1_model: "58STA045", eq1_serial: "2106A04508", eq1_type: "Gas furnace", eq1_filter: "16x25x4",
    h_heat_exchanger: "ok", h_burners: "adj", h_flame_sensor: "adj", h_flame_sensor_val: "3.2",
    h_co: "ok", h_co_val: "4 / 0", h_inducer: "rep", h_inducer_val: "1.9", c_filter: "adj",
    condition: "fair", system_operating: true, next_visit: "04/2027", job_finished: true,
    work_description: "Cleaned burners and flame sensor. Inducer motor is noisy; recommend replacing it before winter.",
    technician: "Jake Miller, Dean Carter",
  };
  it("keeps only the report's fields and valid answers", () => {
    const clean = cleanTicketData("maintenance", { ...PM, h_limits: "maybe", reg_labor: "99", bogus: "x" });
    expect(clean.h_inducer).toBe("rep");
    expect(clean).not.toHaveProperty("h_limits");
    expect(clean).not.toHaveProperty("reg_labor"); // a service-ticket field
    expect(clean).not.toHaveProperty("total_due"); // no money totals on a report
  });
  it("shows answers in words for the AI", () => {
    expect(ticketAsText(PM, "maintenance")).toContain("[h_inducer] Inducer motor: Needs repair");
  });
  it("is a ticket.save op with kind maintenance; old vans default to service", () => {
    const base = { opId: "o", type: "ticket.save", id: "van_" + "b".repeat(32), jobId: "j", invoiceNumber: "x",
      status: "draft", data: PM, savedAt: "2026-11-12T23:00:00.000Z" };
    const pm = parseOp({ ...base, kind: "maintenance" });
    const old = parseOp(base);
    expect("op" in pm && pm.op.type === "ticket.save" && pm.op.kind).toBe("maintenance");
    expect("op" in old && old.op.type === "ticket.save" && old.op.kind).toBe("service");
  });
  it("renders a one-page portrait PDF", async () => {
    const pdf = await PDFDocument.load(await renderTicketPdf(PM, { kind: "maintenance" }));
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });
});
