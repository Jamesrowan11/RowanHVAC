import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { pleskConfigured, listMailboxes, mailDomain } from "@/lib/plesk";
import {
  createMailboxAction, deleteMailboxAction, resetMailboxPasswordAction, setForwardingAction,
} from "@/lib/actions/pleskMail";
import { adminConnectMailboxAction, adminGrantMailboxAccessAction, unlinkMailboxAction } from "@/lib/actions/mailboxLink";
import ActionForm from "@/components/portal/ActionForm";
import ConfirmForm from "@/components/portal/ConfirmForm";

export const metadata = { title: "Email Accounts" };
export const dynamic = "force-dynamic";

export default async function AdminEmailAccounts() {
  await requireRole("ADMIN");

  if (!pleskConfigured()) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-navy">Email Accounts</h1>
        <div className="card max-w-2xl border border-amber-200 bg-amber-50 text-sm text-amber-900">
          <p className="font-semibold">Not connected yet</p>
          <p className="mt-1">
            To manage @{process.env.PLESK_MAIL_DOMAIN || "your domain"} mailboxes from here, add
            <code className="mx-1 rounded bg-white px-1">PLESK_API_HOST</code>,
            <code className="mx-1 rounded bg-white px-1">PLESK_API_KEY</code>,
            <code className="mx-1 rounded bg-white px-1">PLESK_MAIL_SITE_ID</code>, and
            <code className="mx-1 rounded bg-white px-1">PLESK_MAIL_DOMAIN</code> to the server&apos;s
            <code className="mx-1 rounded bg-white px-1">.env</code> file and restart the app.
          </p>
        </div>
      </div>
    );
  }

  let mailboxes: Awaited<ReturnType<typeof listMailboxes>> = [];
  let loadError: string | null = null;
  try {
    mailboxes = await listMailboxes();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Couldn't load mailboxes from Plesk";
  }

  const domain = mailDomain();

  // Staff who could be granted access to a mailbox, and which local Mailbox
  // record (if any) already exists for each Plesk-listed address — matched
  // by address, since Plesk doesn't know about our portal's user records.
  const [staff, localMailboxes] = await Promise.all([
    db.user.findMany({
      where: { role: { in: ["ADMIN", "EMPLOYEE"] } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    db.mailbox.findMany({ include: { access: { include: { user: true } } } }),
  ]);
  const localByAddress = new Map(localMailboxes.map((mb) => [mb.address.toLowerCase(), mb]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-navy">Email Accounts</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create and manage @{domain} mailboxes directly — no need to log into Plesk.
        </p>
      </div>

      <section className="card max-w-xl">
        <h2 className="font-bold text-navy">Create a mailbox</h2>
        <ActionForm
          action={createMailboxAction}
          submitLabel="Create mailbox"
          pendingLabel="Creating…"
          successMessage="Mailbox created."
          buttonClassName="btn-primary"
          className="mt-3 space-y-3"
        >
          <div>
            <label htmlFor="name" className="label">Mailbox name</label>
            <div className="flex items-center gap-2">
              <input id="name" name="name" required className="input" placeholder="teresa" />
              <span className="whitespace-nowrap text-sm text-gray-500">@{domain}</span>
            </div>
          </div>
          <div>
            <label htmlFor="password" className="label">Password (min 8 characters)</label>
            <input id="password" name="password" type="password" required minLength={8} className="input" />
          </div>
        </ActionForm>
      </section>

      <section>
        <h2 className="text-lg font-bold text-navy">Existing mailboxes</h2>
        {loadError && (
          <p className="card mt-3 border border-red-200 bg-red-50 text-sm text-red-700">{loadError}</p>
        )}
        {!loadError && mailboxes.length === 0 && (
          <p className="card mt-3 text-sm text-gray-500">No mailboxes yet.</p>
        )}
        <div className="mt-3 space-y-4">
          {mailboxes.map((m) => {
            const local = localByAddress.get(m.email.toLowerCase());
            const grantedIds = new Set(local?.access.map((a) => a.userId));
            const ungranted = staff.filter((s) => !grantedIds.has(s.id));
            return (
              <div key={m.name} className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-navy">{m.email}</p>
                    <p className="text-xs text-gray-500">
                      {m.enabled ? "Active" : "Disabled"}
                      {m.forwarding.length > 0 && <> · forwards to {m.forwarding.join(", ")}</>}
                    </p>
                  </div>
                  <ConfirmForm
                    action={deleteMailboxAction}
                    confirmText={`Delete ${m.email}? This can't be undone.`}
                  >
                    <input type="hidden" name="name" value={m.name} />
                    <button type="submit" className="btn-danger">Delete</button>
                  </ConfirmForm>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <ActionForm
                    action={resetMailboxPasswordAction}
                    submitLabel="Set password"
                    successMessage="Password updated."
                    className="space-y-2"
                  >
                    <input type="hidden" name="name" value={m.name} />
                    <label htmlFor={`pw-${m.name}`} className="label">New password</label>
                    <input id={`pw-${m.name}`} name="password" type="password" required minLength={8} className="input" />
                  </ActionForm>

                  <ActionForm
                    action={setForwardingAction}
                    submitLabel="Save forwarding"
                    successMessage="Forwarding updated."
                    resetOnSuccess={false}
                    className="space-y-2"
                  >
                    <input type="hidden" name="name" value={m.name} />
                    <label htmlFor={`fwd-${m.name}`} className="label">
                      Forward to (comma-separated, leave blank to stop forwarding)
                    </label>
                    <input
                      id={`fwd-${m.name}`}
                      name="targets"
                      defaultValue={m.forwarding.join(", ")}
                      placeholder="teresa@rowanhvac.com, james@rowanhvac.com"
                      className="input"
                    />
                  </ActionForm>
                </div>

                <div className="mt-4 border-t border-gray-100 pt-4">
                  <p className="label">Portal account access</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Anyone granted access can read and send this mailbox from
                    their own Profile page — a mailbox can be shared by
                    several people at once.
                  </p>

                  {local && local.access.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {local.access.map((a) => (
                        <li key={a.userId} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-gray-700">
                            🔗 <span className="font-medium text-navy">{a.user.name}</span> ({a.user.role === "ADMIN" ? "Admin" : "Employee"})
                          </span>
                          <form action={unlinkMailboxAction}>
                            <input type="hidden" name="userId" value={a.userId} />
                            <input type="hidden" name="mailboxId" value={local.id} />
                            <button type="submit" className="whitespace-nowrap text-xs font-medium text-red-600 hover:underline">
                              Remove access
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}

                  {local ? (
                    ungranted.length > 0 && (
                      <ActionForm
                        action={adminGrantMailboxAccessAction}
                        submitLabel="Grant access"
                        successMessage="Access granted."
                        resetOnSuccess={false}
                        className="mt-3 flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="mailboxId" value={local.id} />
                        <select name="userId" required className="input" defaultValue="">
                          <option value="" disabled>Grant access to…</option>
                          {ungranted.map((s) => (
                            <option key={s.id} value={s.id}>{s.name} ({s.role === "ADMIN" ? "Admin" : "Employee"})</option>
                          ))}
                        </select>
                      </ActionForm>
                    )
                  ) : (
                    <ActionForm
                      action={adminConnectMailboxAction}
                      submitLabel="Connect & verify"
                      pendingLabel="Verifying…"
                      successMessage="Connected — they'll see it on their Profile page."
                      className="mt-2 space-y-2"
                    >
                      <input type="hidden" name="address" value={m.email} />
                      <div className="grid gap-2 sm:grid-cols-3">
                        <select name="userId" required className="input" defaultValue="">
                          <option value="" disabled>Connect for…</option>
                          {staff.map((s) => (
                            <option key={s.id} value={s.id}>{s.name} ({s.role === "ADMIN" ? "Admin" : "Employee"})</option>
                          ))}
                        </select>
                        <input
                          name="password"
                          type="password"
                          required
                          placeholder="Mailbox password"
                          className="input sm:col-span-2"
                        />
                      </div>
                    </ActionForm>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
