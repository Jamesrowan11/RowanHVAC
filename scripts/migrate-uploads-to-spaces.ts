/**
 * One-time move of files from a server's local UPLOAD_DIR into DigitalOcean
 * Spaces (keeps each file's stored name, so database records still match).
 * Safe to re-run: files already in the bucket are skipped.
 *
 *   npm run storage:migrate            (reads .env: UPLOAD_DIR + SPACES_*)
 */
import { promises as fs } from "fs";
import path from "path";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { spacesConfig } from "../src/lib/uploads";

async function main() {
  try {
    process.loadEnvFile?.(".env");
  } catch {
    // no .env file: rely on the environment
  }
  const cfg = spacesConfig();
  if (!cfg) throw new Error("Set SPACES_BUCKET (and SPACES_REGION/KEY/SECRET) first.");
  const dir = path.resolve(process.env.UPLOAD_DIR || "uploads");
  const s3 = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: process.env.SPACES_PATH_STYLE === "1",
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });

  const names = (await fs.readdir(dir, { withFileTypes: true }))
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => e.name);
  let copied = 0;
  let skipped = 0;
  for (const name of names) {
    const Key = cfg.prefix + name;
    try {
      await s3.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key }));
      skipped++;
      continue;
    } catch {
      // not there yet
    }
    await s3.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key,
        Body: await fs.readFile(path.join(dir, name)),
        ACL: "private",
      }),
    );
    copied++;
    console.log("copied", name);
  }
  console.log(`Done: ${copied} copied, ${skipped} already in ${cfg.bucket}/${cfg.prefix}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
