import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PageHeader, EmptyState, fmtDateTime } from "@/components/portal/ui";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import { Pagination, parsePage, PAGE_SIZE } from "@/components/portal/Pagination";
import { deleteRequest, updateRequestStatus } from "../actions";

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-accent/15 text-accent-700",
  REVIEWED: "bg-blue-100 text-blue-800",
  SCHEDULED: "bg-green-100 text-green-800",
  CLOSED: "bg-navy-100 text-navy-500",
};

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireRole("ADMIN");
  const page = parsePage((await searchParams).page);

  const [requests, total] = await Promise.all([
    prisma.request.findMany({
      orderBy: { createdAt: "desc" },
      include: { client: { select: { name: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.request.count(),
  ]);

  return (
    <>
      <PageHeader
        title="Quote & Service Requests"
        subtitle="Incoming requests from the website and from clients in the portal."
      />

      {requests.length === 0 ? (
        <EmptyState>No requests yet.</EmptyState>
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <div key={r.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-navy-900">
                      {r.name}
                    </h3>
                    <span className={`badge ${STATUS_STYLES[r.status]}`}>
                      {r.status}
                    </span>
                    <span className="badge bg-navy-50 text-navy-600">
                      {r.type}
                    </span>
                    {r.client && (
                      <span className="badge bg-navy-50 text-navy-600">
                        Portal client
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-navy-600">
                    {r.serviceNeeded}
                  </p>
                  <p className="mt-1 text-xs text-navy-500">
                    {r.phone} · {r.email} · {fmtDateTime(r.createdAt)}
                  </p>
                  {r.message && (
                    <p className="mt-3 whitespace-pre-wrap rounded-lg bg-navy-50 p-3 text-sm text-navy-700">
                      {r.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link
                  href={`/portal/admin/schedule?fromRequest=${r.id}`}
                  className="btn-primary btn-sm"
                >
                  Schedule a Job
                </Link>

                <form action={updateRequestStatus} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <select
                    name="status"
                    defaultValue={r.status}
                    className="input !w-auto py-1.5 text-xs"
                  >
                    <option value="NEW">New</option>
                    <option value="REVIEWED">Reviewed</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                  <button type="submit" className="btn-outline btn-sm">
                    Update
                  </button>
                </form>

                <form action={deleteRequest} className="ml-auto">
                  <input type="hidden" name="id" value={r.id} />
                  <ConfirmButton message="Delete this request permanently? This cannot be undone.">
                    Delete
                  </ConfirmButton>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} total={total} basePath="/portal/admin/requests" />
    </>
  );
}
