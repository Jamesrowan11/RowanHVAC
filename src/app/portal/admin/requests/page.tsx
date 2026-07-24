import Link from "next/link";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/queries";
import { deleteRequest, closeRequest } from "@/lib/actions/requests";
import { RequestStatusBadge } from "@/components/portal/StatusBadge";
import ConfirmForm from "@/components/portal/ConfirmForm";

export const metadata = { title: "Requests" };

export default async function AdminRequests() {
  await requireRole("ADMIN");

  const requests = await db.quoteRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const sourceLabel: Record<string, string> = {
    PUBLIC: "Website",
    PORTAL: "Client portal",
    MAINTENANCE: "Maintenance request",
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">Quote &amp; Service Requests</h1>

      {requests.length === 0 && <p className="card text-sm text-gray-500">No requests yet.</p>}

      <div className="space-y-4">
        {requests.map((r) => (
          <div key={r.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-navy">{r.name}</h2>
                  <RequestStatusBadge status={r.status} />
                  <span className="badge bg-gray-100 text-gray-600">{sourceLabel[r.source] ?? r.source}</span>
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  {r.service} · {fmtDateTime(r.createdAt)}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  {r.phone} · {r.email}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{r.message}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {r.status === "NEW" && (
                  <Link
                    href={`/portal/admin/schedule?fromRequest=${r.id}`}
                    className="btn-small"
                  >
                    Schedule job
                  </Link>
                )}
                {r.status === "NEW" && (
                  <form action={closeRequest}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="btn-small-outline">Close</button>
                  </form>
                )}
                <ConfirmForm
                  action={deleteRequest}
                  confirmText={`Delete the request from ${r.name}? This can't be undone.`}
                >
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="btn-danger">Delete</button>
                </ConfirmForm>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
