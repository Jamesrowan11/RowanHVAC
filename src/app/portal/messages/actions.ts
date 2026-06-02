"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { isParticipant } from "@/lib/messaging";
import { sendEmail } from "@/lib/email";

export type NewThreadState = { ok: boolean; error?: string };

/**
 * Notify the other participants of a conversation by email (through the email layer).
 */
async function notifyParticipants(
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

export async function startConversation(
  _prev: NewThreadState,
  formData: FormData,
): Promise<NewThreadState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not authorized." };

  const subject = String(formData.get("subject") || "").trim() || null;
  const body = String(formData.get("body") || "").trim();
  if (!body) return { ok: false, error: "Please write a message." };

  // Determine allowed recipients based on the sender's role.
  let recipientIds: string[];

  if (user.role === "CLIENT") {
    // Clients can only message "the company" — route to all active admins.
    // They never choose a recipient and never see a staff directory.
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", active: true },
      select: { id: true },
    });
    recipientIds = admins.map((a) => a.id);
    if (recipientIds.length === 0) {
      return { ok: false, error: "No staff are available to receive messages right now." };
    }
  } else {
    // Staff (ADMIN / EMPLOYEE) pick recipients explicitly.
    const requested = formData.getAll("recipientIds").map(String).filter(Boolean);
    if (requested.length === 0) {
      return { ok: false, error: "Choose at least one recipient." };
    }
    // Validate the recipients exist and are active. Staff may message anyone.
    const valid = await prisma.user.findMany({
      where: { id: { in: requested }, active: true, NOT: { id: user.id } },
      select: { id: true },
    });
    recipientIds = valid.map((v) => v.id);
    if (recipientIds.length === 0) {
      return { ok: false, error: "Those recipients are not available." };
    }
  }

  const participantIds = Array.from(new Set([user.id, ...recipientIds]));

  const convo = await prisma.conversation.create({
    data: {
      subject,
      participants: {
        create: participantIds.map((id) => ({
          userId: id,
          // Sender has read their own new thread.
          lastReadAt: id === user.id ? new Date() : null,
        })),
      },
      messages: {
        create: { senderId: user.id, body },
      },
    },
  });

  await notifyParticipants(convo.id, user.id, user.name, body);

  revalidatePath("/portal/messages");
  redirect(`/portal/messages/${convo.id}`);
}

export async function replyToConversation(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const conversationId = String(formData.get("conversationId"));
  const body = String(formData.get("body") || "").trim();
  if (!body) throw new Error("Message cannot be empty");

  // Server-side access control — must be a participant. Otherwise not-found.
  if (!(await isParticipant(conversationId, user.id))) {
    throw new Error("Not found");
  }

  await prisma.message.create({
    data: { conversationId, senderId: user.id, body },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });
  // Mark the sender's own read pointer current.
  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    data: { lastReadAt: new Date() },
  });

  await notifyParticipants(conversationId, user.id, user.name, body);

  revalidatePath(`/portal/messages/${conversationId}`);
  revalidatePath("/portal/messages");
}

export async function markConversationRead(conversationId: string) {
  const user = await getCurrentUser();
  if (!user) return;
  if (!(await isParticipant(conversationId, user.id))) return;
  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    data: { lastReadAt: new Date() },
  });
  revalidatePath("/portal/messages");
}
