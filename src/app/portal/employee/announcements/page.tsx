import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/queries";

export const metadata = { title: "Announcements" };

export default async function EmployeeAnnouncements() {
  await requireRole("EMPLOYEE", "ADMIN");

  const announcements = await db.announcement.findMany({
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">Company Announcements</h1>
      {announcements.length === 0 && <p className="card text-sm text-gray-500">No announcements yet.</p>}
      <div className="space-y-4">
        {announcements.map((a) => (
          <div key={a.id} className="card">
            <h2 className="font-bold text-navy">{a.title}</h2>
            <p className="mt-1 text-xs text-gray-500">{a.author.name} · {fmtDateTime(a.createdAt)}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{a.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
