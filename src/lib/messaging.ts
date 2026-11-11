import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

/**
 * Total unread messages for a user across all conversations they participate in.
 * A message is unread if it was created after the participant's lastReadAt and
 * was not sent by the user themselves.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const parts = await prisma.conversationParticipant.findMany({
    where: { userId },
    select: { conversationId: true, lastReadAt: true },
  });

  if (parts.length === 0) return 0;

  let total = 0;
  for (const p of parts) {
    const count = await prisma.message.count({
      where: {
        conversationId: p.conversationId,
        senderId: { not: userId },
        ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
      },
    });
    total += count;
  }
  return total;
}

/** Returns true if the user is a participant of the conversation. */
export async function isParticipant(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const found = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  return !!found;
}

/**
 * Notify the other participants of a conversation by email (through the email layer).
 */
export async function notifyParticipants(
  conversationId: string,
  senderId: string,
  senderName: string,
  preview: string,
) {
  const others = await prisma.conversationParticipant.findMany({
    where: { conversationId, userId: { not: senderId } },
    include: { user: { select: { email: true, active: true } } },
  });
  const recipients = others
    .filter((p) => p.user.active)
    .map((p) => p.user.email);
  if (recipients.length === 0) return;

  await sendEmail({
    to: recipients,
    subject: `New message from ${senderName} — Rowan portal`,
    body: `You have a new message in your Rowan portal:\n\n"${preview.slice(0, 300)}"\n\nLog in to your portal to read and reply.`,
    senderUserId: senderId,
  });
}
