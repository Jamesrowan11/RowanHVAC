import { describe, it, expect, beforeAll } from "vitest";
import {
  decryptSecret,
  describeMailError,
  encryptSecret,
  isAllowedMailbox,
  pickSentFolder,
} from "@/lib/mailbox";

beforeAll(() => {
  process.env.AUTH_SECRET ||= "test-secret-for-mailbox-encryption";
});

describe("mailbox password encryption", () => {
  it("round-trips and never stores the plain password", () => {
    const enc = encryptSecret("hunter2!");
    expect(enc).not.toContain("hunter2");
    expect(decryptSecret(enc)).toBe("hunter2!");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("returns null for tampered or foreign values", () => {
    const enc = encryptSecret("secret");
    const parts = enc.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(decryptSecret(parts.join(":"))).toBeNull();
    expect(decryptSecret("garbage")).toBeNull();
  });
});

describe("isAllowedMailbox", () => {
  it("only accepts the company domain", () => {
    expect(isAllowedMailbox("jake@rowanheatingandair.com")).toBe(true);
    expect(isAllowedMailbox("JAKE@RowanHeatingAndAir.com")).toBe(true);
    expect(isAllowedMailbox("jake@gmail.com")).toBe(false);
    expect(isAllowedMailbox("jake@evil-rowanheatingandair.com")).toBe(false);
  });
});

describe("pickSentFolder", () => {
  it("prefers the \\Sent special-use folder", () => {
    expect(
      pickSentFolder([
        { path: "INBOX", name: "INBOX" },
        { path: "Sent", name: "Sent" },
        { path: "INBOX.Sent Items", name: "Sent Items", specialUse: "\\Sent" },
      ]),
    ).toBe("INBOX.Sent Items");
  });

  it("falls back to a folder named Sent (Plesk's INBOX.Sent)", () => {
    expect(
      pickSentFolder([
        { path: "INBOX", name: "INBOX", delimiter: "." },
        { path: "INBOX.Sent", name: "Sent", delimiter: "." },
      ]),
    ).toBe("INBOX.Sent");
  });

  it("guesses by namespace when nothing matches", () => {
    expect(pickSentFolder([{ path: "INBOX.Drafts", name: "Drafts", delimiter: "." }])).toBe("INBOX.Sent");
    expect(pickSentFolder([{ path: "INBOX", name: "INBOX", delimiter: "/" }])).toBe("Sent");
  });
});

describe("describeMailError", () => {
  it("auth failures are permanent and point at reconnecting", () => {
    const f = describeMailError({ code: "EAUTH", responseCode: 535 });
    expect(f.retry).toBe(false);
    expect(f.message).toMatch(/Reconnect/);
  });

  it("bad recipients are permanent", () => {
    expect(describeMailError({ code: "EENVELOPE", responseCode: 550 }).retry).toBe(false);
  });

  it("connection problems are retried", () => {
    expect(describeMailError({ code: "ECONNECTION" }).retry).toBe(true);
    expect(describeMailError({ code: "ETIMEDOUT" }).retry).toBe(true);
  });
});
