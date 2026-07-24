import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { decryptSecret } from "@/lib/secretBox";
import { fetchRecentMessages, fetchMessageBody, type MailboxMessageSummary } from "@/lib/mailbox";

/**
 * Read-side helpers for Server Components. Every lookup goes through
 * MailboxAccess scoped to the CURRENT session user — there is no parameter
 * anywhere that accepts another user's id, so this can never surface a
 * mailbox the caller wasn't granted access to.
 */

export type MyMailbox = { id: string; address: string };

export async function getMyMailboxes(): Promise<MyMailbox[]> {
  const user = await requireUser();
  const access = await db.mailboxAccess.findMany({
    where: { userId: user.id },
    include: { mailbox: { select: { id: true, address: true } } },
    orderBy: { createdAt: "asc" },
  });
  return access.map((a) => a.mailbox);
}

async function requireAccess(mailboxId: string) {
  const user = await requireUser();
  return db.mailboxAccess.findUnique({
    where: { userId_mailboxId: { userId: user.id, mailboxId } },
    include: { mailbox: true },
  });
}

export async function getMailboxMessages(mailboxId: string, limit = 25): Promise<MailboxMessageSummary[] | null> {
  const access = await requireAccess(mailboxId);
  if (!access) return null;
  return fetchRecentMessages(access.mailbox.address, decryptSecret(access.mailbox.encryptedPassword), limit);
}

export async function getMailboxMessageBody(mailboxId: string, uid: number) {
  const access = await requireAccess(mailboxId);
  if (!access) return null;
  return fetchMessageBody(access.mailbox.address, decryptSecret(access.mailbox.encryptedPassword), uid);
}
