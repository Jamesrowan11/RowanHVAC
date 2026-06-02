import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PageHeader, EmptyState, fmtDateTime } from "@/components/portal/ui";
import { NewThread } from "./NewThread";

export default async function MessagesPage() {
  const user = await requireUser();

  // Only conversations this user participates in.
  const parts = await prisma.conversationParticipant.findMany({
    where: { userId: user.id },
    include: {
      conversation: {
        include: {
          participants: {
            include: { user: { select: { id: true, name: true, role: true } } },
          },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  // Sort by latest activity.
  parts.sort(
    (a, b) =>
      new Date(b.conversation.updatedAt).getTime() -
      new Date(a.conversation.updatedAt).getTime(),
  );

  const rows = await Promise.all(
    parts.map(async (p) => {
      const unread = await prisma.message.count({
        where: {
          conversationId: p.conversationId,
          senderId: { not: user.id },
          ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
        },
      });
      const others = p.conversation.participants
        .filter((pp) => pp.user.id !== user.id)
        .map((pp) => pp.user.name);
      const last = p.conversation.messages[0];
      return {
        id: p.conversationId,
        subject: p.conversation.subject,
        others: others.length ? others.join(", ") : "You",
        last,
        unread,
        updatedAt: p.conversation.updatedAt,
      };
    }),
  );

  // Recipient options for staff. Clients never receive a directory.
  const canPickRecipients = user.role !== "CLIENT";
  const recipients = canPickRecipients
    ? await prisma.user.findMany({
        where: { active: true, NOT: { id: user.id } },
        orderBy: [{ role: "asc" }, { name: "asc" }],
        select: { id: true, name: true, email: true, role: true },
      })
    : [];

  return (
    <>
      <PageHeader
        title="Messages"
        subtitle={
          user.role === "CLIENT"
            ? "Your secure conversations with the Rowan team."
            : "Conversations with clients and staff."
        }
      />

      <div className="mb-6">
        <NewThread canPickRecipients={canPickRecipients} recipients={recipients} />
      </div>

      {rows.length === 0 ? (
        <EmptyState>No conversations yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/portal/messages/${r.id}`}
              className="card flex items-center justify-between gap-4 p-4 transition hover:shadow-soft"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold text-navy-900">
                    {r.subject || r.others}
                  </p>
                  {r.unread > 0 && (
                    <span className="badge bg-accent text-white">{r.unread} new</span>
                  )}
                </div>
                <p className="truncate text-xs text-navy-500">
                  {r.subject ? `${r.others} · ` : ""}
                  {r.last ? r.last.body : "No messages yet"}
                </p>
              </div>
              <span className="shrink-0 text-xs text-navy-400">
                {fmtDateTime(r.updatedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
