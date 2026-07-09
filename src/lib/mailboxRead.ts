import { db } from "@/lib/db";
import { requireUser } from "@/lib/guards";
import { decryptSecret } from "@/lib/secretBox";
import { fetchRecentMessages, fetchMessageBody, type MailboxMessageSummary } from "@/lib/mailbox";

/**
 * Read-side helpers for Server Components. Always scoped to the CURRENT
 * session user's own linked mailbox — there is no parameter anywhere that
 * accepts another user's id, so this can never surface someone else's mail.
 */

export async function getMyMailboxAddress(): Promise<string | null> {
  const user = await requireUser();
  const link = await db.mailboxLink.findUnique({ where: { userId: user.id } });
  return link?.address ?? null;
}

export async function getMyRecentMessages(limit = 25): Promise<MailboxMessageSummary[] | null> {
  const user = await requireUser();
  const link = await db.mailboxLink.findUnique({ where: { userId: user.id } });
  if (!link) return null;
  return fetchRecentMessages(link.address, decryptSecret(link.encryptedPassword), limit);
}

export async function getMyMessageBody(uid: number) {
  const user = await requireUser();
  const link = await db.mailboxLink.findUnique({ where: { userId: user.id } });
  if (!link) return null;
  return fetchMessageBody(link.address, decryptSecret(link.encryptedPassword), uid);
}
