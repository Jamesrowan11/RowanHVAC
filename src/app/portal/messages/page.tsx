import Link from "next/link";
import { requireUser } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/queries";

export const metadata = { title: "Messages" };

export default async function MessagesList() {
  const user = await requireUser();

  // Admins see every conversation; everyone else only their own threads.
  const threads = await db.thread.findMany({
    where: user.role === "ADMIN" ? {} : { participants: { some: { userId: user.id } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      participants: { include: { user: { select: { id: true, name: true, role: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const myMembership = (t: (typeof threads)[number]) =>
    t.participants.find((p) => p.user.id === user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-navy">Messages</h1>
        <Link href="/portal/messages/new" className="btn-primary">New Message</Link>
      </div>

      {threads.length === 0 && (
        <p className="card text-sm text-gray-500">
          No conversations yet. Start one with the button above.
        </p>
      )}

      <ul className="space-y-3">
        {threads.map((t) => {
          const last = t.messages[0];
          const membership = myMembership(t);
          const unread =
            !!last &&
            last.authorId !== user.id &&
            (!membership?.lastReadAt || last.createdAt > membership.lastReadAt);
          const others = t.participants
            .filter((p) => p.user.id !== user.id)
            .map((p) => p.user.name);

          return (
            <li key={t.id}>
              <Link
                href={`/portal/messages/${t.id}`}
                className={`card block transition hover:-translate-y-0.5 hover:shadow-lg ${unread ? "border-l-4 border-accent" : ""}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={`${unread ? "font-bold" : "font-semibold"} text-navy`}>
                    {t.subject}
                    {unread && <span className="ml-2 badge bg-accent-100 text-accent-800">New</span>}
                  </p>
                  <p className="text-xs text-gray-500">{fmtDateTime(t.updatedAt)}</p>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  With: {user.role === "CLIENT" ? "Rowan Heating & Air" : others.join(", ") || "—"}
                </p>
                {last && (
                  <p className="mt-2 truncate text-sm text-gray-600">{last.body}</p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
