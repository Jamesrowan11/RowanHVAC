import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import crypto from "crypto";

/**
 * File storage abstraction. Local disk in development; to move to cloud
 * storage (S3 / Vercel Blob), reimplement these three functions — nothing
 * else in the app touches the filesystem.
 */

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

export function isAllowedUpload(mimeType: string): boolean {
  return ALLOWED_MIME.has(mimeType);
}

export async function saveUpload(
  buffer: Buffer,
  originalName: string,
  subdir: "documents" | "team"
): Promise<string> {
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const key = `${subdir}/${crypto.randomUUID()}-${safeName}`;
  const fullPath = path.join(UPLOAD_ROOT, key);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
  return key;
}

export async function readUpload(storagePath: string): Promise<Buffer> {
  // Refuse anything that escapes the upload root.
  const fullPath = path.resolve(UPLOAD_ROOT, storagePath);
  if (!fullPath.startsWith(path.resolve(UPLOAD_ROOT) + path.sep)) {
    throw new Error("Invalid path");
  }
  return readFile(fullPath);
}

export async function deleteUpload(storagePath: string): Promise<void> {
  const fullPath = path.resolve(UPLOAD_ROOT, storagePath);
  if (!fullPath.startsWith(path.resolve(UPLOAD_ROOT) + path.sep)) return;
  await unlink(fullPath).catch(() => {});
}
