import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { manualFileResponse } from "@/lib/manuals";

/** Opens a manual in the browser. Staff (employees and admins) only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "EMPLOYEE")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { id } = await params;
  const manual = await prisma.manual.findUnique({ where: { id } });
  if (!manual) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return manualFileResponse(manual, true);
}
