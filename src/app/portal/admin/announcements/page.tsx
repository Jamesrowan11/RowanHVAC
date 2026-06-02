import { prisma } from "@/lib/prisma";
import { assertRole } from "@/lib/session";
import { PageHeader, EmptyState, fmtDateTime } from "@/components/portal/ui";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import { createAnnouncement, deleteAnnouncement } from "../actions";

export default async function AnnouncementsPage() {
  await assertRole("ADMIN");
  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true } } },
  });

  return (
    <>
      <PageHeader
        title="Company Announcements"
        subtitle="Posted announcements are visible to all employees and admins."
      />

      <div className="card mb-6 p-6">
        <h2 className="mb-4 text-lg font-semibold text-navy-900">New announcement</h2>
        <form action={createAnnouncement} className="space-y-3">
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" name="title" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="body">Message</label>
            <textarea id="body" name="body" rows={3} className="input" required />
          </div>
          <button type="submit" className="btn-primary">Post Announcement</button>
        </form>
      </div>

      {announcements.length === 0 ? (
        <EmptyState>No announcements posted yet.</EmptyState>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div key={a.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-navy-900">{a.title}</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-navy-700">
                    {a.body}
                  </p>
                  <p className="mt-2 text-xs text-navy-400">
                    {a.author.name} · {fmtDateTime(a.createdAt)}
                  </p>
                </div>
                <form action={deleteAnnouncement}>
                  <input type="hidden" name="id" value={a.id} />
                  <ConfirmButton message="Delete this announcement?">
                    Delete
                  </ConfirmButton>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
