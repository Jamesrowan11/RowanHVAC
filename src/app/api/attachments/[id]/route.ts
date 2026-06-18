import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/guards";
import { readUpload } from "@/lib/storage";
import { canViewAttachment } from "@/lib/attachments";

/** Access-controlled serving of note/message photo attachments. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await canViewAttachment(user, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const att = await db.attachment.findUnique({ where: { id } });
  if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const buffer = await readUpload(att.storagePath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": att.mimeType,
        "Content-Disposition": `inline; filename="${att.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
