import { db } from "@/lib/db";
import { saveUpload, isAllowedUpload } from "@/lib/storage";
import type { User } from "@prisma/client";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB each
const MAX_ATTACHMENTS = 6;

/**
 * Save uploaded images/PDFs as attachments on a job note or a message.
 * Silently skips files that are too large or the wrong type — the parent
 * note/message is still created.
 */
export async function saveAttachments(
  files: File[],
  target: { jobNoteId?: string; messageId?: string; uploadedById: string }
): Promise<number> {
  let saved = 0;
  for (const file of files.slice(0, MAX_ATTACHMENTS)) {
    if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) continue;
    if (!isAllowedUpload(file.type)) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = await saveUpload(buffer, file.name, "attachments");
    await db.attachment.create({
      data: {
        jobNoteId: target.jobNoteId ?? null,
        messageId: target.messageId ?? null,
        fileName: file.name,
        storagePath,
        mimeType: file.type,
        size: file.size,
        uploadedById: target.uploadedById,
      },
    });
    saved++;
  }
  return saved;
}

/**
 * Can this user view this attachment? Enforced on the data:
 *  - Job-note attachments: admins, or the technician assigned to that job
 *    (clients never see job notes).
 *  - Message attachments: admins, or a participant of that thread.
 */
export async function canViewAttachment(user: User, attachmentId: string): Promise<boolean> {
  const att = await db.attachment.findUnique({ where: { id: attachmentId } });
  if (!att) return false;

  if (att.jobNoteId) {
    if (user.role === "ADMIN") return true;
    const note = await db.jobNote.findUnique({
      where: { id: att.jobNoteId },
      include: { job: { select: { assignments: { select: { userId: true } } } } },
    });
    return !!note && note.job.assignments.some((a) => a.userId === user.id);
  }

  if (att.messageId) {
    if (user.role === "ADMIN") return true;
    const msg = await db.message.findUnique({
      where: { id: att.messageId },
      select: { threadId: true },
    });
    if (!msg) return false;
    const member = await db.threadParticipant.findUnique({
      where: { threadId_userId: { threadId: msg.threadId, userId: user.id } },
    });
    return !!member;
  }

  return false;
}
