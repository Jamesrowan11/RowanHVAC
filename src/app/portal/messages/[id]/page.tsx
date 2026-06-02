import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isParticipant } from "@/lib/messaging";
import { fmtDateTime } from "@/components/portal/ui";
import { replyToConversation, markConversationRead } from "../actions";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  // Access control: changing the id to a conversation you're not in → not-found.
  if (!(await isParticipant(id, user.id))) notFound();

  const convo = await prisma.conversation.findUnique({
    where: { id },
    include: {
      participants: {
        include: { user: { select: { id: true, name: true, role: true } } },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { id: true, name: true } } },
      },
    },
  });
  if (!convo) notFound();

  // Mark as read now that the participant has opened it.
  await markConversationRead(id);

  const others = convo.participants
    .filter((p) => p.user.id !== user.id)
    .map((p) => p.user.name);

  return (
    <>
      <Link href="/portal/messages" className="text-sm text-accent hover:underline">
        ← Back to messages
      </Link>

      <div className="card mt-4 p-6">
        <h1 className="text-xl font-bold text-navy-900">
          {convo.subject || others.join(", ") || "Conversation"}
        </h1>
        <p className="mt-1 text-sm text-navy-500">
          With: {others.length ? others.join(", ") : "you"}
        </p>

        <div className="mt-6 space-y-4">
          {convo.messages.map((m) => {
            const mine = m.sender?.id === user.id;
            return (
              <div
                key={m.id}
                className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                    mine
                      ? "bg-navy-900 text-white"
                      : "bg-navy-50 text-navy-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
                <p className="mt-1 text-xs text-navy-400">
                  {m.sender?.name ?? "Email"}
                  {m.viaEmail ? " (via email)" : ""} · {fmtDateTime(m.createdAt)}
                </p>
              </div>
            );
          })}
        </div>

        <form action={replyToConversation} className="mt-6 border-t border-navy-100 pt-4">
          <input type="hidden" name="conversationId" value={convo.id} />
          <label className="label" htmlFor="reply">Reply</label>
          <textarea id="reply" name="body" rows={3} className="input" required />
          <div className="mt-2">
            <button type="submit" className="btn-primary">Send Reply</button>
          </div>
        </form>
      </div>
    </>
  );
}
