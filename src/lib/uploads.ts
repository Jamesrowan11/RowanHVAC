import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Local file storage for dev. Files are stored OUTSIDE /public and served only
 * through an access-controlled API route. The interface (store/read/delete by an
 * opaque key) mirrors what an object-storage adapter (S3/GCS) would expose, so
 * swapping to cloud storage later is a localized change.
 */

const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";

function rootDir(): string {
  return path.isAbsolute(UPLOAD_DIR)
    ? UPLOAD_DIR
    : path.join(process.cwd(), UPLOAD_DIR);
}

export const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export async function storeFile(
  file: File,
): Promise<{ storedName: string; size: number; mimeType: string }> {
  const dir = rootDir();
  await fs.mkdir(dir, { recursive: true });

  const ext = path.extname(file.name).slice(0, 12).replace(/[^a-zA-Z0-9.]/g, "");
  const storedName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;

  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, storedName), bytes);

  return { storedName, size: bytes.length, mimeType: file.type };
}

export async function readFile(storedName: string): Promise<Buffer> {
  // Guard against path traversal — only a bare filename is ever valid.
  const safe = path.basename(storedName);
  return fs.readFile(path.join(rootDir(), safe));
}

export async function deleteFile(storedName: string): Promise<void> {
  const safe = path.basename(storedName);
  try {
    await fs.unlink(path.join(rootDir(), safe));
  } catch {
    // already gone — ignore
  }
}
