import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import EmailComposer from "@/components/portal/EmailComposer";
import SentEmailList from "@/components/portal/SentEmailList";

export const metadata = { title: "Email" };

export default async function EmployeeEmail() {
  const user = await requireRole("EMPLOYEE");

  const [clients, logs] = await Promise.all([
    db.user.findMany({
      where: { active: true, role: "CLIENT" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    // Employees only see their OWN sent history.
    db.emailLog.findMany({
      where: { senderUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { sender: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-navy">Email a Customer</h1>
      <section className="card max-w-2xl">
        <h2 className="font-bold text-navy">Compose</h2>
        <div className="mt-4">
          <EmailComposer groups={[{ label: "Clients", users: clients }]} />
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-navy">My Sent Emails</h2>
        <div className="mt-4">
          <SentEmailList logs={logs} showSender={false} />
        </div>
      </section>
    </div>
  );
}
