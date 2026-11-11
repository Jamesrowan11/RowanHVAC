import { describe, it, expect, afterEach } from "vitest";
import { spacesConfig } from "@/lib/uploads";
import { mailConfig } from "@/lib/mailbox";
import { smtpFromHeaders, smtpSender } from "@/lib/email";
import { speedAlertSubject } from "@/lib/vehicleAlerts";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("spacesConfig", () => {
  it("is off without a bucket (local disk storage)", () => {
    delete process.env.SPACES_BUCKET;
    expect(spacesConfig()).toBeNull();
  });

  it("builds the DigitalOcean endpoint from the region", () => {
    process.env.SPACES_BUCKET = "rowanhvac-files";
    process.env.SPACES_REGION = "sfo3";
    delete process.env.SPACES_ENDPOINT;
    delete process.env.SPACES_PREFIX;
    expect(spacesConfig()).toMatchObject({
      bucket: "rowanhvac-files",
      endpoint: "https://sfo3.digitaloceanspaces.com",
      prefix: "uploads/",
    });
  });
});

describe("mailConfig", () => {
  it("defaults to Zoho's organization servers", () => {
    for (const k of ["MAIL_HOST", "MAIL_SMTP_HOST", "MAIL_IMAP_HOST", "MAIL_SMTP_PORT"]) delete process.env[k];
    expect(mailConfig()).toMatchObject({
      smtpHost: "smtppro.zoho.com",
      imapHost: "imappro.zoho.com",
      smtpPort: 465,
      imapPort: 993,
      rejectUnauthorized: true,
    });
  });

  it("MAIL_HOST sets both servers; specific ones win", () => {
    process.env.MAIL_HOST = "mail.example.com";
    process.env.MAIL_IMAP_HOST = "imap.example.com";
    delete process.env.MAIL_SMTP_HOST;
    expect(mailConfig()).toMatchObject({ smtpHost: "mail.example.com", imapHost: "imap.example.com" });
  });
});

describe("website email through a mailbox", () => {
  it("needs both user and password", () => {
    process.env.EMAIL_SMTP_USER = "info@rowanheatingandair.com";
    delete process.env.EMAIL_SMTP_PASSWORD;
    expect(smtpSender()).toBeNull();
    process.env.EMAIL_SMTP_PASSWORD = "secret";
    expect(smtpSender()).toEqual({ user: "info@rowanheatingandair.com", password: "secret" });
  });

  it("sends as the mailbox, keeps the display name, replies to EMAIL_FROM", () => {
    expect(smtpFromHeaders("info@rowanheatingandair.com", "Rowan Heating & Air Conditioning <info@rowanheatingandair.com>")).toEqual({
      from: { name: "Rowan Heating & Air Conditioning", address: "info@rowanheatingandair.com" },
    });
    expect(smtpFromHeaders("noreply@rowanheatingandair.com", "Rowan HVAC <info@rowanheatingandair.com>")).toEqual({
      from: { name: "Rowan HVAC", address: "noreply@rowanheatingandair.com" },
      replyTo: "info@rowanheatingandair.com",
    });
  });
});

describe("speed alert subjects", () => {
  it("one van's prefix doesn't match another's", () => {
    expect(speedAlertSubject("Van 1")).toBe("Speed alert: Van 1 at ");
    expect(`${speedAlertSubject("Van 12", 85)} mph`.startsWith(speedAlertSubject("Van 1"))).toBe(false);
  });
});
