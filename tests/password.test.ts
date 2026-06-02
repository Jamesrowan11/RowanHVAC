import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password hashing", () => {
  it("produces a bcrypt hash that is not the plaintext", async () => {
    const hash = await hashPassword("Password123!");
    expect(hash).not.toBe("Password123!");
    expect(hash.startsWith("$2")).toBe(true);
  });

  it("verifies a correct password", async () => {
    const hash = await hashPassword("Secret!23");
    expect(await verifyPassword("Secret!23", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("Secret!23");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
