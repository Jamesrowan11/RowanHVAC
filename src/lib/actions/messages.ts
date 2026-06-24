"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/guards";
import { notify } from "@/lib/email";
import { notifySms } from "@/lib/sms";
import { notifyPush } from "@/lib/push";
import { saveAttachments } from "@/lib/attachments";
import { COMPANY } from "@/lib/constants";
import { canAccessThread } from "@/lib/messaging";
import type { ActionState } from "@/lib/actions/jobs";
import type { User } from "@prisma/client";

/**
 * Messaging rules, enforced on the data:
 *  - CLIENT: talks to the company only. New threads go to all active admins;
 *    clients can never address another client or pick from a staff list.
 *  - EMPLOYEE: may start threads with admins, other employees, or clients.
 *  - ADMIN: may start threads with anyone and can read/reply to all threads.
 */

export async function startThread(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actionUser();

  const subject = String(formData.get("subject") ?? "").trim().slice(0, 200);
  const body = String(formData.get("body") ?? "").trim().slice(0, 10000);
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!subject) return { ok: false, error: "Subject is required" };
  if (!body && files.length === 0) return { ok: false, error: "Add a message or a photo" };

  let participantIds: string[];

  if (user.role === "CLIENT") {
    // Clients always message "the company" — all active admins.
    const admins = await db.user.findMany({
      where: { role: "ADMIN", active: true },
      select: { id: true },
    });
    if (admins.length === 0) return { ok: false, error: "No staff available right now — please call us" };
    participantIds = admins.map((a) => a.id);
  } else {
    const recipientId = String(formData.get("recipientId") ?? "");
    const allowedRoles =
      user.role === "ADMIN" ? ["ADMIN", "EMPLOYEE", "CLIENT"] : ["ADMIN", "EMPLOYEE", "CLIENT"];
    const recipient = await db.user.findFirst({
      where: { id: recipientId, active: true, role: { in: allowedRoles as never }, NOT: { id: user.id } },
    });
    if (!recipient) return { ok: false, error: "Pick a recipient" };
    participantIds = [recipient.id];
  }

  const thread = await db.thread.create({
    data: {
      subject,
      participants: {
        create: [
          { userId: user.id, lastReadAt: new Date() },
          ...participantIds.map((id) => ({ userId: id })),
        ],
      },
    },
  });
  const message = await db.message.create({
    data: { threadId: thread.id, authorId: user.id, body: body || "(photo)" },
  });
  await saveAttachments(files, { messageId: message.id, uploadedById: user.id });

  await notifyParticipants(thread.id, user, body || "(sent a photo)");

  revalidatePath("/portal", "layout");
  redirect(`/portal/messages/${thread.id}`);
}

export async function replyToThread(formData: FormData): Promise<void> {
  const user = await actionUser();
  const threadId = String(formData.get("threadId") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 10000);
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!body && files.length === 0) return;

  if (!(await canAccessThread(user, threadId))) throw new Error("Not found");

  // An admin replying to a thread they weren't in joins it as a participant.
  await db.threadParticipant.upsert({
    where: { threadId_userId: { threadId, userId: user.id } },
    create: { threadId, userId: user.id, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });

  const message = await db.message.create({
    data: { threadId, authorId: user.id, body: body || "(photo)" },
  });
  await saveAttachments(files, { messageId: message.id, uploadedById: user.id });
  await db.thread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });

  await notifyParticipants(threadId, user, body || "(sent a photo)");
  revalidatePath("/portal", "layout");
}

export async function markThreadRead(threadId: string): Promise<void> {
  const user = await actionUser();
  await db.threadParticipant.updateMany({
    where: { threadId, userId: user.id },
    data: { lastReadAt: new Date() },
  });
}

/** Automation: new-message notification emails to the other participants. */
async function notifyParticipants(threadId: string, author: User, body: string) {
  const others = await db.threadParticipant.findMany({
    where: { threadId, NOT: { userId: author.id } },
    include: { user: { select: { id: true, email: true, phone: true, active: true } } },
  });
  const thread = await db.thread.findUnique({ where: { id: threadId } });
  if (!thread) return;
  const active = others.filter((p) => p.user.active);
  notifyPush(
    active.map((p) => p.user.id),
    {
      title: `New message from ${author.name}`,
      body: body.slice(0, 140),
      url: `/portal/messages/${threadId}`,
    }
  );
  const emails = active.map((p) => p.user.email);
  if (emails.length > 0) {
    notify({
      to: emails,
      subject: `New message: ${thread.subject}`,
      body: `You have a new message from ${author.name} on ${COMPANY.name}'s portal.\n\n"${body.slice(0, 500)}${body.length > 500 ? "…" : ""}"\n\nReply here: ${process.env.APP_URL || ""}/portal/messages/${threadId}`,
    });
  }
  const phones = active.map((p) => p.user.phone).filter((p): p is string => !!p);
  if (phones.length > 0) {
    notifySms({
      to: phones,
      body: `${COMPANY.shortName}: new message from ${author.name}. Reply in your portal: ${process.env.APP_URL || ""}/portal/messages`,
    });
  }
}
