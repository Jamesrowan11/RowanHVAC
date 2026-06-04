import { describe, it, expect } from "vitest";
import { parseRecipients, isValidEmail } from "@/lib/email";

describe("isValidEmail", () => {
  it("accepts well-formed addresses", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("first.last@sub.example.co")).toBe(true);
  });
  it("rejects malformed addresses", () => {
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@c.com")).toBe(false);
  });
});

describe("parseRecipients", () => {
  it("splits and trims comma-separated addresses", () => {
    const { valid, invalid } = parseRecipients(" a@b.com, c@d.com ");
    expect(valid).toEqual(["a@b.com", "c@d.com"]);
    expect(invalid).toEqual([]);
  });

  it("separates invalid addresses", () => {
    const { valid, invalid } = parseRecipients("good@x.com, bad, also@y.com");
    expect(valid).toEqual(["good@x.com", "also@y.com"]);
    expect(invalid).toEqual(["bad"]);
  });

  it("ignores empty entries", () => {
    const { valid } = parseRecipients("a@b.com,,");
    expect(valid).toEqual(["a@b.com"]);
  });
});
