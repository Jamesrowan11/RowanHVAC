import { createReadStream, promises as fs } from "fs";
import { Readable } from "stream";
import path from "path";
import crypto from "crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * File storage for client documents and equipment manuals. Files are never
 * public: they are served only through access-controlled routes.
 *
 * Two backends behind one small store/read/delete-by-key interface:
 * - DigitalOcean Spaces (or any S3-compatible bucket) when SPACES_BUCKET is
 *   set. Use this behind a load balancer, so every server sees every file.
 * - The local disk (UPLOAD_DIR) otherwise: fine for a single server and dev.
 *
 * Spaces settings:
 *   SPACES_BUCKET    bucket (Space) name, e.g. rowanhvac-files
 *   SPACES_REGION    e.g. nyc3
 *   SPACES_ENDPOINT  default https://<region>.digitaloceanspaces.com
 *   SPACES_KEY / SPACES_SECRET   a Spaces access key (Limited Access to this bucket)
 *   SPACES_PREFIX    optional folder inside the bucket (default "uploads/")
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

// ---------- Backend selection ----------

export function spacesConfig() {
  const bucket = process.env.SPACES_BUCKET;
  if (!bucket) return null;
  const region = process.env.SPACES_REGION || "nyc3";
  return {
    bucket,
    region,
    endpoint: process.env.SPACES_ENDPOINT || `https://${region}.digitaloceanspaces.com`,
    prefix: process.env.SPACES_PREFIX ?? "uploads/",
    accessKeyId: process.env.SPACES_KEY || "",
    secretAccessKey: process.env.SPACES_SECRET || "",
  };
}

let client: S3Client | null = null;
function s3(cfg: NonNullable<ReturnType<typeof spacesConfig>>): S3Client {
  if (!client) {
    client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      // Path-style works for Spaces and for local S3-compatible test servers.
      forcePathStyle: process.env.SPACES_PATH_STYLE === "1",
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }
  return client;
}

/** Only a bare generated filename is ever a valid key (no path traversal). */
function safeName(storedName: string): string {
  return path.basename(storedName);
}

function newStoredName(originalName: string): string {
  const ext = path.extname(originalName).slice(0, 12).replace(/[^a-zA-Z0-9.]/g, "");
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
}

// ---------- Interface ----------

export async function storeFile(
  file: File,
): Promise<{ storedName: string; size: number; mimeType: string; sha256: string }> {
  const storedName = newStoredName(file.name);
  const bytes = Buffer.from(await file.arrayBuffer());
  const cfg = spacesConfig();

  if (cfg) {
    await s3(cfg).send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: cfg.prefix + storedName,
        Body: bytes,
        ContentType: file.type || "application/octet-stream",
        ACL: "private",
      }),
    );
  } else {
    const dir = rootDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, storedName), bytes);
  }

  return {
    storedName,
    size: bytes.length,
    mimeType: file.type,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function readFile(storedName: string): Promise<Buffer> {
  const cfg = spacesConfig();
  if (cfg) {
    const res = await s3(cfg).send(
      new GetObjectCommand({ Bucket: cfg.bucket, Key: cfg.prefix + safeName(storedName) }),
    );
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  return fs.readFile(path.join(rootDir(), safeName(storedName)));
}

/** Streams a stored file (for large files such as equipment manuals). */
export async function openFileStream(
  storedName: string,
): Promise<{ stream: ReadableStream<Uint8Array>; size: number }> {
  const cfg = spacesConfig();
  if (cfg) {
    const res = await s3(cfg).send(
      new GetObjectCommand({ Bucket: cfg.bucket, Key: cfg.prefix + safeName(storedName) }),
    );
    return {
      stream: res.Body!.transformToWebStream() as ReadableStream<Uint8Array>,
      size: res.ContentLength ?? 0,
    };
  }
  const full = path.join(rootDir(), safeName(storedName));
  const { size } = await fs.stat(full);
  const stream = Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>;
  return { stream, size };
}

export async function deleteFile(storedName: string): Promise<void> {
  const cfg = spacesConfig();
  try {
    if (cfg) {
      await s3(cfg).send(
        new DeleteObjectCommand({ Bucket: cfg.bucket, Key: cfg.prefix + safeName(storedName) }),
      );
    } else {
      await fs.unlink(path.join(rootDir(), safeName(storedName)));
    }
  } catch {
    // already gone — ignore
  }
}
