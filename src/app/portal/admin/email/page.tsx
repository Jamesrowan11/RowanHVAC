import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import EmailComposer from "@/components/portal/EmailComposer";
import SentEmailList from "@/components/portal/SentEmailList";

export const metadata = { title: "Email" };

export default async function AdminEmail() {
  await requireRole("ADMIN");

  const [users, logs] = await Promise.all([
    db.user.findMany({
      where: { active: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true },
    }),
    // Admin sees the full sent history, including automated sends.
    db.emailLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { sender: { select: { name: true } } },
    }),
  ]);

  const groups = [
    { label: "Clients", users: users.filter((u) => u.role === "CLIENT") },
    { label: "Employees", users: users.filter((u) => u.role === "EMPLOYEE") },
    { label: "Admins", users: users.filter((u) => u.role === "ADMIN") },
  ].filter((g) => g.users.length > 0);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-navy">Email</h1>
      <section className="card max-w-2xl">
        <h2 className="font-bold text-navy">Compose</h2>
        <div className="mt-4">
          <EmailComposer groups={groups} />
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-navy">Sent Email History</h2>
        <p className="mt-1 text-sm text-gray-500">Every email the system has sent, and who sent it.</p>
        <div className="mt-4">
          <SentEmailList logs={logs} showSender />
        </div>
      </section>
    </div>
  );
}
