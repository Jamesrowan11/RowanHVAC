import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import EmailComposer from "@/components/portal/EmailComposer";
import SentEmailList from "@/components/portal/SentEmailList";
import { fmtDateTime } from "@/lib/queries";

export const metadata = { title: "Email & SMS" };

export default async function AdminEmail() {
  await requireRole("ADMIN");

  const [users, logs, smsLogs] = await Promise.all([
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
    db.smsLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
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

      <section>
        <h2 className="text-lg font-bold text-navy">SMS History</h2>
        <p className="mt-1 text-sm text-gray-500">
          Automated text notifications, sent from the company&apos;s Twilio
          number. Until Twilio is connected these are logged in
          &ldquo;console mode&rdquo; (recorded here, printed to the server log).
        </p>
        <ul className="mt-4 space-y-2">
          {smsLogs.length === 0 && <li className="text-sm text-gray-500">No texts yet.</li>}
          {smsLogs.map((s) => (
            <li key={s.id} className="rounded-lg bg-navy-50 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-navy">To: {s.toNumbers}</span>
                <span className={`badge ${s.status === "SENT" ? "bg-green-100 text-green-800" : s.status === "FAILED" ? "bg-red-100 text-red-700" : "bg-navy-100 text-navy-800"}`}>
                  {s.status === "LOGGED" ? "Logged (console)" : s.status === "SENT" ? "Sent" : "Failed"}
                </span>
              </div>
              <p className="mt-1 text-gray-700">{s.body}</p>
              <p className="mt-1 text-xs text-gray-500">{fmtDateTime(s.createdAt)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
