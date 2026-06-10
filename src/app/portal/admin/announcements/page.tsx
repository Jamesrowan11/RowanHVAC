import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/queries";
import { createAnnouncement, deleteAnnouncement } from "@/lib/actions/announcements";
import ActionForm from "@/components/portal/ActionForm";
import ConfirmForm from "@/components/portal/ConfirmForm";

export const metadata = { title: "Announcements" };

export default async function AdminAnnouncements() {
  await requireRole("ADMIN");

  const announcements = await db.announcement.findMany({
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true } } },
  });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-navy">Company Announcements</h1>

      <section className="card max-w-2xl">
        <h2 className="font-bold text-navy">Post an announcement</h2>
        <p className="mt-1 text-xs text-gray-500">Employees see these in their dashboard and get an email.</p>
        <ActionForm
          action={createAnnouncement}
          submitLabel="Post announcement"
          pendingLabel="Posting…"
          successMessage="Posted — the team has been emailed."
          buttonClassName="btn-primary"
          className="mt-4 space-y-3"
        >
          <div>
            <label htmlFor="title" className="label">Title</label>
            <input id="title" name="title" required className="input" />
          </div>
          <div>
            <label htmlFor="body" className="label">Body</label>
            <textarea id="body" name="body" required rows={4} className="input" />
          </div>
        </ActionForm>
      </section>

      <section className="space-y-4">
        {announcements.map((a) => (
          <div key={a.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-navy">{a.title}</h2>
                <p className="mt-1 text-xs text-gray-500">{a.author.name} · {fmtDateTime(a.createdAt)}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{a.body}</p>
              </div>
              <ConfirmForm action={deleteAnnouncement} confirmText={`Delete "${a.title}"?`}>
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className="btn-danger">Delete</button>
              </ConfirmForm>
            </div>
          </div>
        ))}
        {announcements.length === 0 && <p className="card text-sm text-gray-500">No announcements yet.</p>}
      </section>
    </div>
  );
}
