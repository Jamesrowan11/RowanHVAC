import { prisma } from "@/lib/prisma";
import { assertRole } from "@/lib/session";
import { PageHeader, EmptyState, fmtDateTime } from "@/components/portal/ui";

export default async function EmployeeAnnouncements() {
  await assertRole("EMPLOYEE", "ADMIN");
  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true } } },
  });

  return (
    <>
      <PageHeader title="Company Announcements" />
      {announcements.length === 0 ? (
        <EmptyState>No announcements yet.</EmptyState>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div key={a.id} className="card p-5">
              <h3 className="font-semibold text-navy-900">{a.title}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-navy-700">{a.body}</p>
              <p className="mt-2 text-xs text-navy-400">
                {a.author.name} · {fmtDateTime(a.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
