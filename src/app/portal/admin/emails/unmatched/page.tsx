import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/queries";
import { resolveUnmatched, deleteUnmatched } from "@/lib/actions/admin";
import ConfirmForm from "@/components/portal/ConfirmForm";

export const metadata = { title: "Unmatched Inbox" };

export default async function AdminUnmatched() {
  await requireRole("ADMIN");

  const items = await db.unmatchedInbound.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Unmatched Inbox</h1>
        <p className="mt-1 text-sm text-gray-500">
          Inbound emails from addresses that don&apos;t match any portal user.
        </p>
      </div>

      {items.length === 0 && <p className="card text-sm text-gray-500">Nothing here — all inbound mail matched a user.</p>}

      <div className="space-y-4">
        {items.map((m) => (
          <div key={m.id} className={`card ${m.resolved ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-navy">{m.subject}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  From {m.fromAddress} · {fmtDateTime(m.createdAt)}
                  {m.resolved && " · resolved"}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{m.body}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {!m.resolved && (
                  <form action={resolveUnmatched}>
                    <input type="hidden" name="id" value={m.id} />
                    <button type="submit" className="btn-small-outline">Mark resolved</button>
                  </form>
                )}
                <ConfirmForm action={deleteUnmatched} confirmText="Delete this inbound email?">
                  <input type="hidden" name="id" value={m.id} />
                  <button type="submit" className="btn-danger">Delete</button>
                </ConfirmForm>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
