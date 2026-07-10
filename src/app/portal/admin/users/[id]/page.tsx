import { notFound } from "next/navigation";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime } from "@/lib/queries";
import { updateUser, setUserPassword, setUserActive, deleteUser, setMaintenancePolicy } from "@/lib/actions/users";
import {
  addPaymentLink, markPaymentPaid, deletePaymentLink,
  uploadDocument, deleteDocument,
  addCustomerNote, deleteCustomerNote,
  addEmployeeNote, deleteEmployeeNote,
} from "@/lib/actions/clients";
import { PaymentStatusBadge, JobStatusBadge } from "@/components/portal/StatusBadge";
import ActionForm from "@/components/portal/ActionForm";
import ConfirmForm from "@/components/portal/ConfirmForm";

export const metadata = { title: "Manage User" };

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole("ADMIN");
  const { id } = await params;

  const user = await db.user.findUnique({
    where: { id },
    include: {
      paymentLinks: { orderBy: { createdAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
      customerNotes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      employeeNotes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      jobsAsClient: { orderBy: { scheduledAt: "desc" }, take: 10 },
    },
  });
  if (!user) notFound();

  const roleLabel = { ADMIN: "Admin", EMPLOYEE: "Employee", CLIENT: "Client" }[user.role];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-navy">
          {user.name}
          {user.customerNumber != null && <span className="ml-2 text-gray-400">#{user.customerNumber}</span>}
        </h1>
        <span className="badge bg-navy-100 text-navy-800">{roleLabel}</span>
        <span className={`badge ${user.active ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"}`}>
          {user.active ? "Active" : "Deactivated"}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Contact info */}
        <section className="card">
          <h2 className="font-bold text-navy">Contact info</h2>
          <ActionForm
            action={updateUser}
            submitLabel="Save changes"
            successMessage="Saved."
            resetOnSuccess={false}
            className="mt-4 space-y-3"
          >
            <input type="hidden" name="id" value={user.id} />
            <div>
              <label htmlFor="name" className="label">Name</label>
              <input id="name" name="name" required defaultValue={user.name} className="input" />
            </div>
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input id="email" name="email" type="email" required defaultValue={user.email} className="input" />
            </div>
            <div>
              <label htmlFor="phone" className="label">Phone</label>
              <input id="phone" name="phone" defaultValue={user.phone ?? ""} className="input" />
            </div>
            <div>
              <label htmlFor="address" className="label">Address</label>
              <input id="address" name="address" defaultValue={user.address ?? ""} className="input" />
            </div>
            {user.role === "CLIENT" && (
              <div>
                <label htmlFor="customerNumber" className="label">Customer # (matches QuickBooks)</label>
                <input
                  id="customerNumber"
                  name="customerNumber"
                  type="number"
                  min={1}
                  defaultValue={user.customerNumber ?? ""}
                  className="input"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Shown next to their name everywhere and included in the
                  QuickBooks export so invoices land on the right customer.
                </p>
              </div>
            )}
          </ActionForm>
        </section>

        {/* Account controls */}
        <section className="card space-y-5">
          <div>
            <h2 className="font-bold text-navy">Set a new password</h2>
            <ActionForm
              action={setUserPassword}
              submitLabel="Set password"
              successMessage="Password updated."
              className="mt-3"
            >
              <input type="hidden" name="id" value={user.id} />
              <label htmlFor="password" className="label">New password (min 8 characters)</label>
              <input id="password" name="password" type="password" required minLength={8} className="input" />
            </ActionForm>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h2 className="font-bold text-navy">Account status</h2>
            <p className="mt-1 text-xs text-gray-500">
              Deactivated accounts can&apos;t log in and don&apos;t appear in assignment lists; their history is kept.
            </p>
            <div className="mt-3 flex gap-2">
              {user.active ? (
                <ConfirmForm
                  action={setUserActive}
                  confirmText={`Deactivate ${user.name}? They will no longer be able to log in.`}
                >
                  <input type="hidden" name="id" value={user.id} />
                  <input type="hidden" name="active" value="false" />
                  <button type="submit" className="btn-small-outline">Deactivate</button>
                </ConfirmForm>
              ) : (
                <form action={setUserActive}>
                  <input type="hidden" name="id" value={user.id} />
                  <input type="hidden" name="active" value="true" />
                  <button type="submit" className="btn-small">Reactivate</button>
                </form>
              )}
              {user.id !== admin.id && (
                <ConfirmForm
                  action={deleteUser}
                  confirmText={`Permanently delete ${user.name}? Prefer Deactivate — deletion only works for accounts with no job history.`}
                >
                  <input type="hidden" name="id" value={user.id} />
                  <button type="submit" className="btn-danger">Delete</button>
                </ConfirmForm>
              )}
            </div>
          </div>

          {user.role === "CLIENT" && (
            <div className="border-t border-gray-100 pt-4">
              <h2 className="font-bold text-navy">Maintenance policy</h2>
              <p className="mt-1 text-sm text-gray-600">
                {user.policyActive
                  ? `Active${user.policyRenewal ? ` — renews ${fmtDate(user.policyRenewal)}` : ""}`
                  : "No active policy"}
              </p>
              <form action={setMaintenancePolicy} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={user.id} />
                <input type="hidden" name="policyActive" value={user.policyActive ? "false" : "true"} />
                {!user.policyActive && (
                  <div>
                    <label htmlFor="policyRenewal" className="label">Renewal date</label>
                    <input id="policyRenewal" name="policyRenewal" type="date" className="input" />
                  </div>
                )}
                <button type="submit" className={user.policyActive ? "btn-small-outline" : "btn-small"}>
                  {user.policyActive ? "Mark policy inactive" : "Activate policy"}
                </button>
              </form>
            </div>
          )}
        </section>
      </div>

      {user.role === "CLIENT" && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Payments */}
            <section className="card">
              <h2 className="font-bold text-navy">Payment links</h2>
              <p className="mt-1 text-xs text-gray-500">
                Paste a payment-link URL (Stripe, Square, bank…) — the client is emailed automatically.
              </p>
              <ActionForm
                action={addPaymentLink}
                submitLabel="Send payment link"
                successMessage="Link saved and emailed to the client."
                className="mt-3 space-y-3"
              >
                <input type="hidden" name="clientId" value={user.id} />
                <div>
                  <label htmlFor="pay-url" className="label">Payment URL</label>
                  <input id="pay-url" name="url" type="url" required placeholder="https://…" className="input" />
                </div>
                <div>
                  <label htmlFor="pay-label" className="label">Label (optional)</label>
                  <input id="pay-label" name="label" placeholder="Spring tune-up invoice" className="input" />
                </div>
              </ActionForm>
              <ul className="mt-4 space-y-2">
                {user.paymentLinks.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-navy-50 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-navy">{p.label ?? p.url}</p>
                      <p className="text-xs text-gray-500">
                        {fmtDateTime(p.createdAt)}{p.paidAt ? ` · paid ${fmtDateTime(p.paidAt)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <PaymentStatusBadge status={p.status} />
                      {p.status === "SENT" && (
                        <form action={markPaymentPaid}>
                          <input type="hidden" name="id" value={p.id} />
                          <button type="submit" className="btn-small">Mark paid</button>
                        </form>
                      )}
                      <ConfirmForm action={deletePaymentLink} confirmText="Delete this payment link?">
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="text-xs font-medium text-red-600 hover:underline">Delete</button>
                      </ConfirmForm>
                    </div>
                  </li>
                ))}
                {user.paymentLinks.length === 0 && <li className="text-sm text-gray-500">No payment links yet.</li>}
              </ul>
            </section>

            {/* Documents */}
            <section className="card">
              <h2 className="font-bold text-navy">Documents</h2>
              <p className="mt-1 text-xs text-gray-500">
                PDF or image, 10 MB max — the client is emailed when you share one.
              </p>
              <ActionForm
                action={uploadDocument}
                submitLabel="Upload & share"
                pendingLabel="Uploading…"
                successMessage="Document shared with the client."
                className="mt-3"
              >
                <input type="hidden" name="clientId" value={user.id} />
                <input name="file" type="file" required accept="application/pdf,image/*" className="input" aria-label="Document file" />
              </ActionForm>
              <ul className="mt-4 space-y-2">
                {user.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-navy-50 p-3 text-sm">
                    <div className="min-w-0">
                      <a href={`/api/files/${d.id}`} className="truncate font-medium text-accent-600 hover:underline">
                        {d.fileName}
                      </a>
                      <p className="text-xs text-gray-500">{fmtDateTime(d.createdAt)} · {(d.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <ConfirmForm action={deleteDocument} confirmText={`Delete ${d.fileName}?`}>
                      <input type="hidden" name="id" value={d.id} />
                      <button type="submit" className="text-xs font-medium text-red-600 hover:underline">Delete</button>
                    </ConfirmForm>
                  </li>
                ))}
                {user.documents.length === 0 && <li className="text-sm text-gray-500">No documents yet.</li>}
              </ul>
            </section>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Internal customer notes */}
            <section className="card">
              <h2 className="font-bold text-navy">Internal customer notes</h2>
              <p className="mt-1 text-xs text-gray-500">Staff only — never visible to the client.</p>
              <form action={addCustomerNote} className="mt-3 flex items-start gap-2">
                <input type="hidden" name="clientId" value={user.id} />
                <textarea name="body" required rows={2} placeholder="Add a note…" className="input flex-1" />
                <button type="submit" className="btn-small">Add</button>
              </form>
              <ul className="mt-4 space-y-2">
                {user.customerNotes.map((n) => (
                  <li key={n.id} className="rounded-lg bg-amber-50 p-3 text-sm">
                    <p className="whitespace-pre-wrap text-gray-800">{n.body}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <p className="text-xs text-gray-500">{n.author.name} · {fmtDateTime(n.createdAt)}</p>
                      <ConfirmForm action={deleteCustomerNote} confirmText="Delete this note?">
                        <input type="hidden" name="id" value={n.id} />
                        <button type="submit" className="text-xs font-medium text-red-600 hover:underline">Delete</button>
                      </ConfirmForm>
                    </div>
                  </li>
                ))}
                {user.customerNotes.length === 0 && <li className="text-sm text-gray-500">No notes yet.</li>}
              </ul>
            </section>

            {/* Recent jobs */}
            <section className="card">
              <h2 className="font-bold text-navy">Recent jobs</h2>
              <ul className="mt-3 space-y-2">
                {user.jobsAsClient.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-2 rounded-lg bg-navy-50 p-3 text-sm">
                    <div>
                      <p className="font-medium text-navy">{j.service}</p>
                      <p className="text-xs text-gray-500">{fmtDateTime(j.scheduledAt)}</p>
                    </div>
                    <JobStatusBadge status={j.status} />
                  </li>
                ))}
                {user.jobsAsClient.length === 0 && <li className="text-sm text-gray-500">No jobs yet.</li>}
              </ul>
            </section>
          </div>
        </>
      )}

      {user.role === "EMPLOYEE" && (
        <section className="card">
          <h2 className="font-bold text-navy">Internal employee notes</h2>
          <p className="mt-1 text-xs text-gray-500">
            Admin-only — never visible to this employee or other employees.
          </p>
          <form action={addEmployeeNote} className="mt-3 flex items-start gap-2">
            <input type="hidden" name="employeeId" value={user.id} />
            <textarea name="body" required rows={2} placeholder="Add a note…" className="input flex-1" />
            <button type="submit" className="btn-small">Add</button>
          </form>
          <ul className="mt-4 space-y-2">
            {user.employeeNotes.map((n) => (
              <li key={n.id} className="rounded-lg bg-amber-50 p-3 text-sm">
                <p className="whitespace-pre-wrap text-gray-800">{n.body}</p>
                <div className="mt-1 flex items-center justify-between">
                  <p className="text-xs text-gray-500">{n.author.name} · {fmtDateTime(n.createdAt)}</p>
                  <ConfirmForm action={deleteEmployeeNote} confirmText="Delete this note?">
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className="text-xs font-medium text-red-600 hover:underline">Delete</button>
                  </ConfirmForm>
                </div>
              </li>
            ))}
            {user.employeeNotes.length === 0 && <li className="text-sm text-gray-500">No notes yet.</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
