import { db } from "@/lib/db";
import type { User } from "@prisma/client";

/**
 * Thread access = participant, or admin (admins see all conversations).
 * Anything else — including a forged thread id — reads as "not found".
 */
export async function canAccessThread(user: User, threadId: string): Promise<boolean> {
  if (user.role === "ADMIN") {
    return (await db.thread.count({ where: { id: threadId } })) > 0;
  }
  const member = await db.threadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId: user.id } },
  });
  return !!member;
}
