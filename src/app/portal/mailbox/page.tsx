import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guards";
import { linkMyMailboxAction, unlinkMailboxAction, sendFromMyMailboxAction } from "@/lib/actions/mailboxLink";
import { getMyMailboxes, getMailboxMessages } from "@/lib/mailboxRead";
import ActionForm from "@/components/portal/ActionForm";
import ConfirmForm from "@/components/portal/ConfirmForm";

export const metadata = { title: "My Mailbox" };
export const dynamic = "force-dynamic";

export default async function MailboxPage({
  searchParams,
}: {
  searchParams: Promise<{ mailbox?: string }>;
}) {
  const user = await requireUser();

  // Company mailboxes are a staff feature — clients never see this page.
  const isStaff = user.role === "ADMIN" || user.role === "EMPLOYEE";
  if (!isStaff) redirect("/portal");

  const mailboxes = await getMyMailboxes();
  const { mailbox: requested } = await searchParams;
  const active = mailboxes.find((m) => m.id === requested) ?? mailboxes[0] ?? null;

  let messages: Awaited<ReturnType<typeof getMailboxMessages>> = null;
  let mailboxError: string | null = null;
  if (active) {
    try {
      messages = await getMailboxMessages(active.id, 15);
    } catch (e) {
      mailboxError = e instanceof Error ? e.message : "Couldn't load your inbox";
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">My Mailbox</h1>

      <section className="card max-w-4xl">
        {mailboxes.length > 1 && (
          <nav aria-label="Connected mailboxes" className="border-b border-navy-100">
            <ul className="flex gap-1 overflow-x-auto">
              {mailboxes.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/portal/mailbox?mailbox=${m.id}`}
                    className={`block whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
                      active?.id === m.id
                        ? "border-accent-600 text-accent-600"
                        : "border-transparent text-gray-500 hover:text-navy"
                    }`}
                  >
                    {m.address}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {active && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-gray-500">Connected: {active.address}</p>
              <ConfirmForm action={unlinkMailboxAction} confirmText={`Disconnect ${active.address} from your account?`}>
                <input type="hidden" name="mailboxId" value={active.id} />
                <button type="submit" className="text-xs font-medium text-red-600 hover:underline">Disconnect</button>
              </ConfirmForm>
            </div>

            {mailboxError && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {mailboxError}
              </p>
            )}

            {!mailboxError && (
              <ul className="mt-4 divide-y divide-gray-100">
                {(messages ?? []).length === 0 && (
                  <li className="py-3 text-sm text-gray-500">No messages yet.</li>
                )}
                {(messages ?? []).map((m) => (
                  <li key={m.uid} className="py-2">
                    <Link
                      href={`/portal/mailbox/${active.id}/${m.uid}`}
                      className={`block rounded-lg px-2 py-1.5 text-sm hover:bg-navy-50 ${!m.seen ? "font-semibold text-navy" : "text-gray-700"}`}
                    >
                      <span className="block truncate">{m.subject}</span>
                      <span className="block truncate text-xs font-normal text-gray-500">
                        {m.from} · {new Date(m.date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 border-t border-gray-100 pt-4">
              <h3 className="text-sm font-bold text-navy">Send a message</h3>
              <ActionForm
                action={sendFromMyMailboxAction}
                submitLabel="Send"
                pendingLabel="Sending…"
                successMessage="Sent."
                className="mt-2 space-y-2"
              >
                <input type="hidden" name="mailboxId" value={active.id} />
                <input name="to" type="email" required placeholder="To" className="input" />
                <input name="subject" required placeholder="Subject" className="input" />
                <textarea name="body" required rows={4} placeholder="Message" className="input" />
              </ActionForm>
            </div>
          </div>
        )}

        <details className="mt-6 border-t border-gray-100 pt-4">
          <summary className="cursor-pointer text-sm font-medium text-accent-600">
            {mailboxes.length === 0 ? "Connect your mailbox" : "Connect another mailbox"}
          </summary>
          <p className="mt-2 text-sm text-gray-500">
            Connect an @rowanhvac.com mailbox to read and send email right
            here in the portal. Your credentials are stored encrypted and
            used only to connect on your behalf — an admin can also grant
            you access to a shared mailbox from Emails → Accounts.
          </p>
          <ActionForm
            action={linkMyMailboxAction}
            submitLabel="Connect mailbox"
            pendingLabel="Verifying…"
            successMessage="Connected!"
            buttonClassName="btn-primary"
            className="mt-4 space-y-3"
          >
            <div>
              <label htmlFor="address" className="label">Email address</label>
              <input id="address" name="address" type="email" required placeholder="you@rowanhvac.com" className="input" />
            </div>
            <div>
              <label htmlFor="password" className="label">Mailbox password</label>
              <input id="password" name="password" type="password" required className="input" />
            </div>
          </ActionForm>
        </details>
      </section>
    </div>
  );
}
