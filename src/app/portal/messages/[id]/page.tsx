import { notFound } from "next/navigation";
import { requireUser } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/queries";
import { canAccessThread } from "@/lib/messaging";
import { replyToThread, markThreadRead } from "@/lib/actions/messages";

export const metadata = { title: "Conversation" };

export default async function ThreadView({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  // Participants (or admins) only — a forged conversation id is a 404.
  if (!(await canAccessThread(user, id))) notFound();

  const thread = await db.thread.findUnique({
    where: { id },
    include: {
      participants: { include: { user: { select: { id: true, name: true, role: true } } } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, role: true } } },
      },
    },
  });
  if (!thread) notFound();

  await markThreadRead(thread.id);

  const others = thread.participants
    .filter((p) => p.user.id !== user.id)
    .map((p) => p.user.name);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">{thread.subject}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {user.role === "CLIENT" ? "With Rowan Heating & Air" : `With: ${others.join(", ") || "—"}`}
        </p>
      </div>

      <div className="space-y-3">
        {thread.messages.map((m) => {
          const mine = m.author.id === user.id;
          // Clients see staff replies as "the company", not individual staff.
          const displayName = mine
            ? "You"
            : user.role === "CLIENT" && m.author.role !== "CLIENT"
              ? "Rowan Heating & Air"
              : m.author.name;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-xl p-4 shadow-card ${mine ? "bg-navy text-white" : "bg-white"}`}>
                <p className={`text-xs font-semibold ${mine ? "text-navy-200" : "text-gray-500"}`}>
                  {displayName}
                  {m.viaEmail && " · via email"}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
                <p className={`mt-2 text-xs ${mine ? "text-navy-300" : "text-gray-400"}`}>
                  {fmtDateTime(m.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <form action={replyToThread} className="card">
        <input type="hidden" name="threadId" value={thread.id} />
        <label htmlFor="body" className="label">Reply</label>
        <textarea id="body" name="body" required rows={3} className="input" />
        <button type="submit" className="btn-primary mt-3">Send reply</button>
      </form>
    </div>
  );
}
