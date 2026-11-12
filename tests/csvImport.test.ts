import { describe, expect, it } from "vitest";
import {
  CUSTOMER_COLUMNS,
  JOB_COLUMNS,
  cell,
  formatTime,
  fullAddress,
  mapColumns,
  parseCsv,
  parseDay,
  parseStatus,
  personName,
} from "@/lib/csvImport";

describe("parseCsv", () => {
  it("handles quotes, commas and newlines inside fields, CRLF and a BOM", () => {
    const text = '﻿Name,Notes\r\n"Smith, Ed","Said ""hi""\nthen left"\r\nPat,ok\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ["Name", "Notes"],
      ["Smith, Ed", 'Said "hi"\nthen left'],
      ["Pat", "ok"],
    ]);
  });
});

describe("column matching", () => {
  it("understands typical exports", () => {
    const hcp = ["Customer First Name", "Customer Last Name", "Email Address", "Mobile Phone", "Street", "City", "State", "Zip Code"];
    const m = mapColumns(hcp, CUSTOMER_COLUMNS);
    const row = ["Ed", "Joholske", "ed@example.com", "301-642-5733", "11394 Liberty Street", "Fulton", "MD", "20759"];
    expect(personName(row, m)).toBe("Ed Joholske");
    expect(cell(row, m, "email")).toBe("ed@example.com");
    expect(cell(row, m, "phone")).toBe("301-642-5733");
    expect(fullAddress(row, m)).toBe("11394 Liberty Street, Fulton, MD 20759");
  });
  it("maps job columns", () => {
    const header = ["Job #", "Client", "Service Date", "Arrival Window", "Job Description", "Assigned Employees", "Job Status", "Work Notes"];
    const m = mapColumns(header, JOB_COLUMNS);
    expect(m).toMatchObject({ name: 1, date: 2, time: 3, service: 4, technician: 5, status: 6, summary: 7 });
  });
});

describe("dates and times", () => {
  it("reads common date formats as UTC days", () => {
    const iso = (s: string) => parseDay(s)?.day.toISOString().slice(0, 10);
    expect(iso("4/17/2015")).toBe("2015-04-17");
    expect(iso("04-17-15")).toBe("2015-04-17");
    expect(iso("2015-04-17")).toBe("2015-04-17");
    expect(iso("April 17, 2015")).toBe("2015-04-17");
    expect(iso("Fri, Apr 17 2015")).toBe("2015-04-17");
    expect(iso("17 Apr 2015")).toBe("2015-04-17");
    expect(iso("42111")).toBe("2015-04-17"); // Excel serial
    expect(parseDay("2/30/2015")).toBeNull();
    expect(parseDay("soon")).toBeNull();
  });
  it("splits a time off the date", () => {
    expect(parseDay("4/17/2015 2:15 PM")).toMatchObject({ time: "2:15 PM" });
    expect(parseDay("2015-04-17T14:15:00Z")).toMatchObject({ time: "2:15 PM" });
    expect(formatTime("09:00")).toBe("9:00 AM");
    expect(formatTime("12:30pm")).toBe("12:30 PM");
    expect(formatTime("8-10am")).toBe("8-10am");
  });
  it("picks a status, defaulting from the date", () => {
    const today = new Date("2026-11-12T15:00:00Z");
    const d = (s: string) => new Date(s + "T00:00:00Z");
    expect(parseStatus("", d("2015-04-17"), today)).toBe("COMPLETED");
    expect(parseStatus("", d("2026-12-01"), today)).toBe("SCHEDULED");
    expect(parseStatus("", d("2026-11-12"), today)).toBe("SCHEDULED");
    expect(parseStatus("Canceled", d("2015-04-17"), today)).toBe("CANCELLED");
    expect(parseStatus("Paid", d("2026-12-01"), today)).toBe("COMPLETED");
    expect(parseStatus("In Progress", d("2015-04-17"), today)).toBe("IN_PROGRESS");
  });
});
