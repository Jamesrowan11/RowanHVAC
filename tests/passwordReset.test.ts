import { describe, it, expect } from "vitest";
import {
  generateResetToken,
  hashResetToken,
  resetEmailRecipient,
} from "@/lib/passwordReset";

describe("reset tokens", () => {
  it("hash is deterministic and matches the raw token", () => {
    const { raw, hash } = generateResetToken();
    expect(hash).toBe(hashResetToken(raw));
    expect(hash).not.toBe(raw);
    expect(hash).toHaveLength(64); // sha256 hex
  });

  it("different tokens produce different hashes", () => {
    expect(generateResetToken().hash).not.toBe(generateResetToken().hash);
  });
});

describe("resetEmailRecipient", () => {
  it("staff use personalEmail when set", () => {
    expect(
      resetEmailRecipient({
        role: "ADMIN",
        email: "admin@rowanhvac.com",
        personalEmail: "me@personal.com",
      }),
    ).toBe("me@personal.com");
    expect(
      resetEmailRecipient({
        role: "EMPLOYEE",
        email: "tech@rowanhvac.com",
        personalEmail: "tech@personal.com",
      }),
    ).toBe("tech@personal.com");
  });

  it("staff fall back to login email when no personalEmail", () => {
    expect(
      resetEmailRecipient({
        role: "ADMIN",
        email: "admin@rowanhvac.com",
        personalEmail: null,
      }),
    ).toBe("admin@rowanhvac.com");
  });

  it("clients always use their listed email, even if a personalEmail exists", () => {
    expect(
      resetEmailRecipient({
        role: "CLIENT",
        email: "client@example.com",
        personalEmail: "ignored@personal.com",
      }),
    ).toBe("client@example.com");
  });
});
