import { describe, it, expect } from "vitest";
import {
  bearerToken,
  clampNoteTime,
  generateDeviceToken,
  hashDeviceToken,
  hashSnapshot,
  isTokenIdleExpired,
  parseOp,
  VAN_TOKEN_IDLE_DAYS,
} from "@/lib/vanSync";

describe("device tokens", () => {
  it("hash matches the raw token and is not the token", () => {
    const { raw, hash } = generateDeviceToken();
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashDeviceToken(raw));
    expect(hash).not.toBe(raw);
  });

  it("parses only well-formed bearer headers", () => {
    const { raw } = generateDeviceToken();
    expect(bearerToken(`Bearer ${raw}`)).toBe(raw);
    expect(bearerToken(`bearer ${raw.toUpperCase()}`)).toBe(raw);
    expect(bearerToken(raw)).toBeNull();
    expect(bearerToken("Bearer short")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  it("expires after the idle window", () => {
    const now = new Date("2026-10-24T12:00:00Z");
    const recent = new Date(now.getTime() - 86_400_000);
    const stale = new Date(now.getTime() - (VAN_TOKEN_IDLE_DAYS + 1) * 86_400_000);
    expect(isTokenIdleExpired(recent, now)).toBe(false);
    expect(isTokenIdleExpired(stale, now)).toBe(true);
  });
});

describe("parseOp", () => {
  const noteId = "van_" + "a".repeat(32);

  it("accepts valid status and note ops", () => {
    expect(
      parseOp({ opId: "1", type: "job.status", jobId: "j1", status: "IN_PROGRESS" }),
    ).toHaveProperty("op");
    expect(
      parseOp({
        opId: "2",
        type: "note.add",
        id: noteId,
        jobId: "j1",
        body: "Replaced capacitor",
        createdAt: "2026-10-24T12:00:00Z",
      }),
    ).toHaveProperty("op");
  });

  it("rejects cancelling from a van, bad note ids, and junk", () => {
    const cancelled = parseOp({ opId: "3", type: "job.status", jobId: "j1", status: "CANCELLED" });
    expect(cancelled).toEqual({
      result: { opId: "3", ok: false, error: expect.any(String) },
    });
    const badId = parseOp({
      opId: "4",
      type: "note.add",
      id: "cl_someone_elses_note",
      jobId: "j1",
      body: "x",
      createdAt: "2026-10-24T12:00:00Z",
    });
    expect("result" in badId && badId.result.opId).toBe("4");
    const junk = parseOp("nope");
    expect("result" in junk && junk.result.opId).toBe("unknown");
  });
});

describe("clampNoteTime", () => {
  const now = new Date("2026-10-24T12:00:00Z");

  it("keeps plausible device times", () => {
    expect(clampNoteTime("2026-10-24T09:30:00Z", now).toISOString()).toBe(
      "2026-10-24T09:30:00.000Z",
    );
  });

  it("replaces future or absurd times (bad van clock) with now", () => {
    expect(clampNoteTime("2027-01-01T00:00:00Z", now)).toEqual(now);
    expect(clampNoteTime("2004-01-01T00:00:00Z", now)).toEqual(now);
    expect(clampNoteTime("garbage", now)).toEqual(now);
  });
});

describe("hashSnapshot", () => {
  it("ignores key order but sees value changes", () => {
    const a = { jobs: [{ id: "1", status: "SCHEDULED" }], user: { id: "u" } };
    const b = { user: { id: "u" }, jobs: [{ status: "SCHEDULED", id: "1" }] };
    expect(hashSnapshot(a)).toBe(hashSnapshot(b));
    expect(hashSnapshot(a)).not.toBe(
      hashSnapshot({ ...a, jobs: [{ id: "1", status: "COMPLETED" }] }),
    );
  });
});
