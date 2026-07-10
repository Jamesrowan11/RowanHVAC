import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/guards";
import { saveUpload, isAllowedUpload } from "@/lib/storage";

const MAX_BYTES = 15 * 1024 * 1024; // generous — client compresses first

/** Bulk photo upload for a service ticket: one file per request, called in
 * parallel/series by the wizard's uploader. Tech must own the ticket. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || (user.role !== "EMPLOYEE" && user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const ticket = await db.serviceTicket.findFirst({
    where: user.role === "ADMIN" ? { id } : { id, techId: user.id },
  });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await request.formData();
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large" }, { status: 413 });
  if (!isAllowedUpload(file.type)) return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = await saveUpload(buffer, file.name, "attachments");
  const att = await db.attachment.create({
    data: {
      serviceTicketId: ticket.id,
      fileName: file.name,
      storagePath,
      mimeType: file.type,
      size: file.size,
      uploadedById: user.id,
    },
  });

  return NextResponse.json({ id: att.id, fileName: att.fileName });
}
