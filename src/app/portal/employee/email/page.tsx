import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PageHeader } from "@/components/portal/ui";
import { ComposeEmail } from "@/components/portal/ComposeEmail";
import { SentEmailList } from "@/components/portal/SentEmailList";

export default async function EmployeeEmailPage() {
  const user = await requireRole("EMPLOYEE", "ADMIN");

  // Employees may email clients.
  const [recipients, emails] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, role: "CLIENT" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
    // Employees see only their own sent history.
    prisma.emailLog.findMany({
      where: { senderUserId: user.id, direction: "OUTBOUND" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Compose Email"
        subtitle="Send individual correspondence to a client and/or a typed address."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-semibold text-navy-900">New Email</h2>
          <ComposeEmail recipients={recipients} />
        </div>
        <div>
          <h2 className="mb-4 text-lg font-semibold text-navy-900">My Sent History</h2>
          <SentEmailList emails={emails} showSender={false} />
        </div>
      </div>
    </>
  );
}
