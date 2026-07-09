import { requireRole } from "@/lib/guards";
import { pleskConfigured, listMailboxes, mailDomain } from "@/lib/plesk";
import {
  createMailboxAction, deleteMailboxAction, resetMailboxPasswordAction, setForwardingAction,
} from "@/lib/actions/pleskMail";
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
          {mailboxes.map((m) => (
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
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
