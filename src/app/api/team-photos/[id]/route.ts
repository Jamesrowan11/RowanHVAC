import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readUpload } from "@/lib/storage";

/** Public photos for the "Meet Our Techs" section. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await db.teamMember.findFirst({ where: { id, active: true } });
  if (!member?.photoPath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const buffer = await readUpload(member.photoPath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": member.mimeType ?? "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
