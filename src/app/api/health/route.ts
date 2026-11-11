import { prisma } from "@/lib/prisma";

/**
 * Health check for the DigitalOcean load balancer: 200 when this server can
 * reach the database, 503 otherwise (the balancer then stops sending it
 * traffic). Path: /api/health
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "database unreachable" }, { status: 503 });
  }
}
