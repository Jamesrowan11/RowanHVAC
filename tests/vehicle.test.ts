import { describe, it, expect } from "vitest";
import {
  alignReadings,
  dayRange,
  dtcDescription,
  readingNear,
  summarizeSpeeds,
  todayIn,
  tzOffsetMs,
  zonedTime,
} from "@/lib/vehicle";
import { parseOp } from "@/lib/vanSync";

const NY = "America/New_York";

describe("time zones", () => {
  it("knows EDT and EST offsets", () => {
    expect(tzOffsetMs(new Date("2026-07-01T12:00:00Z"), NY)).toBe(-4 * 3600_000);
    expect(tzOffsetMs(new Date("2026-12-01T12:00:00Z"), NY)).toBe(-5 * 3600_000);
  });

  it("maps a local day to UTC bounds, including DST days", () => {
    expect(dayRange("2026-10-24", NY)).toEqual({
      start: new Date("2026-10-24T04:00:00Z"),
      end: new Date("2026-10-25T04:00:00Z"),
    });
    // Fall back (Nov 1 2026): a 25-hour day
    const { start, end } = dayRange("2026-11-01", NY);
    expect(end.getTime() - start.getTime()).toBe(25 * 3600_000);
    expect(zonedTime("2026-10-24", "14:15", NY)).toEqual(new Date("2026-10-24T18:15:00Z"));
  });

  it("finds today's local date", () => {
    expect(todayIn(NY, new Date("2026-10-25T02:00:00Z"))).toBe("2026-10-24");
  });
});

describe("alignReadings", () => {
  const now = new Date("2026-10-24T18:00:00Z");

  it("keeps times when the van clock is right", () => {
    const r = alignReadings([{ t: "2026-10-24T17:59:00Z", mph: 41.6 }], "2026-10-24T18:00:00Z", now);
    expect(r).toEqual([{ recordedAt: new Date("2026-10-24T17:59:00Z"), mph: 42 }]);
  });

  it("corrects a van clock that is years off", () => {
    // Laptop thinks it's 2004 (dead CMOS battery)
    const r = alignReadings([{ t: "2004-01-01T00:09:00Z", mph: 30 }], "2004-01-01T00:10:00Z", now);
    expect(r[0].recordedAt).toEqual(new Date("2026-10-24T17:59:00Z"));
  });

  it("drops future and ancient readings", () => {
    expect(alignReadings([{ t: "2026-10-25T00:00:00Z", mph: 1 }], "2026-10-24T18:00:00Z", now)).toEqual([]);
    expect(alignReadings([{ t: "2026-08-01T00:00:00Z", mph: 1 }], "2026-10-24T18:00:00Z", now)).toEqual([]);
  });
});

describe("summarizeSpeeds", () => {
  const at = (min: number, mph: number) => ({ recordedAt: new Date(Date.UTC(2026, 9, 24, 14, min)), mph });

  it("finds top speed, moving time and over-limit stretches", () => {
    const readings = [at(0, 0), at(1, 30), at(2, 72), at(3, 75), at(4, 50), at(5, 71), at(30, 74), at(31, 0)];
    const s = summarizeSpeeds(readings, 70);
    expect(s.max?.mph).toBe(75);
    expect(s.events.map((e) => e.maxMph)).toEqual([75, 71, 74]); // the 25-min gap splits the last one
    expect(s.events[0].start).toEqual(at(2, 0).recordedAt);
    expect(s.events[0].end).toEqual(at(3, 0).recordedAt);
    // moving 1→5 (4 min) + 30→31 (1 min); the gap doesn't count
    expect(s.movingMinutes).toBe(5);
  });

  it("treats a short dip under the limit as one stretch", () => {
    const sec = (s: number, mph: number) => ({ recordedAt: new Date(Date.UTC(2026, 9, 24, 14, 0, s)), mph });
    const s = summarizeSpeeds([sec(0, 72), sec(10, 68), sec(20, 69), sec(30, 78), sec(40, 60)], 70);
    expect(s.events).toHaveLength(1);
    expect(s.events[0].maxMph).toBe(78);
  });

  it("looks up the reading nearest a time", () => {
    const readings = [at(0, 10), at(10, 40)];
    expect(readingNear(readings, at(9, 0).recordedAt)?.mph).toBe(40);
    expect(readingNear(readings, at(30, 0).recordedAt)).toBeNull();
  });
});

describe("vehicle ops", () => {
  it("accepts speed batches and code reports, rejects bad codes", () => {
    expect(
      parseOp({ opId: "s1", type: "speed.batch", deviceNow: "2026-10-24T18:00:00Z", readings: [{ t: "2026-10-24T17:59:50Z", mph: 44 }] }),
    ).toHaveProperty("op");
    const codes = { opId: "c1", type: "obd.codes", id: "van_" + "a".repeat(32), at: "2026-10-24T18:00:00Z", milOn: true, stored: ["P0301"], pending: [] };
    expect(parseOp(codes)).toHaveProperty("op");
    expect(parseOp({ ...codes, stored: ["X1234"] })).toHaveProperty("result");
  });

  it("describes common codes", () => {
    expect(dtcDescription("P0301")).toBe("Cylinder 1 misfire detected");
    expect(dtcDescription("P1234")).toBeNull();
  });
});
