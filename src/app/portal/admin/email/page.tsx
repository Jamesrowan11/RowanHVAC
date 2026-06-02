import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PageHeader } from "@/components/portal/ui";
import { ComposeEmail } from "@/components/portal/ComposeEmail";
import { SentEmailList } from "@/components/portal/SentEmailList";

export default async function AdminEmailPage() {
  await requireRole("ADMIN");

  const [recipients, emails] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.emailLog.findMany({
      where: { direction: "OUTBOUND" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { sender: { select: { name: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Compose Email"
        subtitle="Send individual correspondence to portal users and/or typed addresses (up to 25 recipients)."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-semibold text-navy-900">New Email</h2>
          <ComposeEmail recipients={recipients} />
        </div>
        <div>
          <h2 className="mb-4 text-lg font-semibold text-navy-900">
            Sent History (all senders)
          </h2>
          <SentEmailList emails={emails} showSender />
        </div>
      </div>
    </>
  );
}
