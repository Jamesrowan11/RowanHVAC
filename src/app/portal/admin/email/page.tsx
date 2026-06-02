import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PageHeader } from "@/components/portal/ui";
import { ComposeEmail } from "@/components/portal/ComposeEmail";
import { SentEmailList } from "@/components/portal/SentEmailList";
import { Pagination, parsePage, PAGE_SIZE } from "@/components/portal/Pagination";

export default async function AdminEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireRole("ADMIN");
  const page = parsePage((await searchParams).page);

  const [recipients, emails, total] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.emailLog.findMany({
      where: { direction: "OUTBOUND" },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { sender: { select: { name: true } } },
    }),
    prisma.emailLog.count({ where: { direction: "OUTBOUND" } }),
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
          <Pagination page={page} total={total} basePath="/portal/admin/email" />
        </div>
      </div>
    </>
  );
}
