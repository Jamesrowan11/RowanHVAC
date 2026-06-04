import { describe, it, expect, beforeEach } from "vitest";
import {
  rateLimit,
  clientIpFromHeaders,
  __resetRateLimits,
} from "@/lib/rateLimit";

describe("rateLimit", () => {
  beforeEach(() => __resetRateLimits());

  it("allows requests under the limit", () => {
    const a = rateLimit("k", 3, 1000);
    const b = rateLimit("k", 3, 1000);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(b.remaining).toBe(1);
  });

  it("blocks requests over the limit", () => {
    rateLimit("k", 2, 1000);
    rateLimit("k", 2, 1000);
    const third = rateLimit("k", 2, 1000);
    expect(third.ok).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("isolates different keys", () => {
    rateLimit("a", 1, 1000);
    const other = rateLimit("b", 1, 1000);
    expect(other.ok).toBe(true);
  });

  it("resets after the window elapses", async () => {
    rateLimit("k", 1, 10);
    expect(rateLimit("k", 1, 10).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 15));
    expect(rateLimit("k", 1, 10).ok).toBe(true);
  });
});

describe("clientIpFromHeaders", () => {
  it("prefers the first x-forwarded-for entry", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(clientIpFromHeaders(h)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip then unknown", () => {
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe(
      "9.9.9.9",
    );
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});
