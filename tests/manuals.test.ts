import { describe, it, expect } from "vitest";
import { manualDownloadName, manualSchema, manualSearchWhere } from "@/lib/manuals";

describe("manualSearchWhere", () => {
  it("is empty for a blank search", () => {
    expect(manualSearchWhere("  ")).toEqual({});
  });

  it("requires every word to match some field", () => {
    const where = manualSearchWhere("Trane XR14") as { AND: unknown[] };
    expect(where.AND).toHaveLength(2);
    expect(JSON.stringify(where.AND[1])).toContain('"model":{"contains":"XR14"}');
  });
});

describe("manualSchema", () => {
  it("accepts a known equipment type and trims", () => {
    const r = manualSchema.parse({ brand: " Carrier ", model: "24ACC6", equipmentType: "Air Conditioner" });
    expect(r.brand).toBe("Carrier");
  });

  it("rejects unknown types and missing brand", () => {
    expect(manualSchema.safeParse({ brand: "", model: "x", equipmentType: "Air Conditioner" }).success).toBe(false);
    expect(manualSchema.safeParse({ brand: "a", model: "x", equipmentType: "Toaster" }).success).toBe(false);
  });
});

describe("manualDownloadName", () => {
  it("builds a safe, readable file name", () => {
    expect(
      manualDownloadName({ brand: "Carrier", model: "24ACC6/36", title: 'Install "IM"', originalName: "x.PDF" }),
    ).toBe("Carrier - 24ACC6_36 - Install _IM_.PDF");
  });
});
