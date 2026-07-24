import crypto from "crypto";

/**
 * Reversible encryption for credentials we must use later (mailbox passwords)
 * — unlike login passwords, these can't be one-way hashed, since the app has
 * to actually present them to IMAP/SMTP servers. AES-256-GCM with a key from
 * MAILBOX_CREDENTIALS_KEY (generate with `openssl rand -hex 32`).
 *
 * Stored format: base64(iv[12] || authTag[16] || ciphertext).
 */

function getKey(): Buffer {
  const hex = process.env.MAILBOX_CREDENTIALS_KEY;
  if (!hex) throw new Error("MAILBOX_CREDENTIALS_KEY is not set");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("MAILBOX_CREDENTIALS_KEY must be 32 bytes (64 hex characters)");
  }
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(blob: string): string {
  const raw = Buffer.from(blob, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
