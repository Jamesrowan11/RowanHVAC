import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

/**
 * Health check: 200 when this server can reach the database, 503 otherwise.
 * Also says which version is live (the deployed Git commit and the newest
 * database migration), so a deploy can be confirmed from outside.
 * Path: /api/health
 */
export const dynamic = "force-dynamic";

function deployedCommit(): string | null {
  try {
    const git = path.join(process.cwd(), ".git");
    const head = fs.readFileSync(path.join(git, "HEAD"), "utf8").trim();
    // The deploy checks out a commit directly ("detached"), or a branch ref.
    const sha = head.startsWith("ref: ")
      ? fs.readFileSync(path.join(git, head.slice(5)), "utf8").trim()
      : head;
    return /^[0-9a-f]{40}$/.test(sha) ? sha.slice(0, 7) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const [latest] = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL
      ORDER BY migration_name DESC LIMIT 1`;
    return Response.json(
      { ok: true, commit: deployedCommit(), migration: latest?.migration_name ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ ok: false, error: "database unreachable" }, { status: 503 });
  }
}
