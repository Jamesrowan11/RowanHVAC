import { db } from "@/lib/db";

/** Messages in the user's threads, written by someone else, newer than lastReadAt. */
export async function unreadMessageCount(userId: string): Promise<number> {
  const memberships = await db.threadParticipant.findMany({
    where: { userId },
    select: { threadId: true, lastReadAt: true },
  });
  if (memberships.length === 0) return 0;

  const counts = await Promise.all(
    memberships.map((m) =>
      db.message.count({
        where: {
          threadId: m.threadId,
          authorId: { not: userId },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      })
    )
  );
  return counts.reduce((a, b) => a + b, 0);
}

export function fmtDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
