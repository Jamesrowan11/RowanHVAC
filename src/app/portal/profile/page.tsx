import Link from "next/link";
import { requireUser } from "@/lib/guards";
import { updateOwnProfile, changeOwnPassword } from "@/lib/actions/profile";
import { linkMyMailboxAction, unlinkMailboxAction, sendFromMyMailboxAction } from "@/lib/actions/mailboxLink";
import { getMyMailboxAddress, getMyRecentMessages } from "@/lib/mailboxRead";
import ActionForm from "@/components/portal/ActionForm";
import ConfirmForm from "@/components/portal/ConfirmForm";

export const metadata = { title: "My Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  // Always the session user — this page can never edit anyone else.
  const user = await requireUser();

  // Company mailboxes are a staff feature — clients never see this section.
  const isStaff = user.role === "ADMIN" || user.role === "EMPLOYEE";
  const mailboxAddress = isStaff ? await getMyMailboxAddress() : null;
  let messages: Awaited<ReturnType<typeof getMyRecentMessages>> = null;
  let mailboxError: string | null = null;
  if (mailboxAddress) {
    try {
      messages = await getMyRecentMessages(15);
    } catch (e) {
      mailboxError = e instanceof Error ? e.message : "Couldn't load your inbox";
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-navy">My Profile</h1>

      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="font-bold text-navy">Contact info</h2>
          <ActionForm
            action={updateOwnProfile}
            submitLabel="Save changes"
            successMessage="Profile updated."
            resetOnSuccess={false}
            className="mt-4 space-y-3"
          >
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
            {user.role === "CLIENT" && (
              <div>
                <label htmlFor="address" className="label">Service address</label>
                <input id="address" name="address" defaultValue={user.address ?? ""} className="input" />
              </div>
            )}
          </ActionForm>
        </section>

        <section className="card">
          <h2 className="font-bold text-navy">Change password</h2>
          <ActionForm
            action={changeOwnPassword}
            submitLabel="Change password"
            successMessage="Password changed."
            className="mt-4 space-y-3"
          >
            <div>
              <label htmlFor="currentPassword" className="label">Current password</label>
              <input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" className="input" />
            </div>
            <div>
              <label htmlFor="newPassword" className="label">New password (min 8 characters)</label>
              <input id="newPassword" name="newPassword" type="password" required minLength={8} autoComplete="new-password" className="input" />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="label">Confirm new password</label>
              <input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className="input" />
            </div>
          </ActionForm>
        </section>
      </div>

      {isStaff && (
        <section className="card max-w-4xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-navy">My Mailbox</h2>
            {mailboxAddress && (
              <ConfirmForm action={unlinkMailboxAction} confirmText={`Disconnect ${mailboxAddress} from your profile?`}>
                <button type="submit" className="text-xs font-medium text-red-600 hover:underline">Disconnect</button>
              </ConfirmForm>
            )}
          </div>

          {!mailboxAddress ? (
            <>
              <p className="mt-1 text-sm text-gray-500">
                Connect your @rowanhvac.com mailbox to read and send email right
                here in the portal. Your credentials are stored encrypted and
                used only to connect on your behalf — an admin can also set
                this up for you from Email Accounts.
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
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-gray-500">Connected: {mailboxAddress}</p>

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
                        href={`/portal/profile/mailbox/${m.uid}`}
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
                  <input name="to" type="email" required placeholder="To" className="input" />
                  <input name="subject" required placeholder="Subject" className="input" />
                  <textarea name="body" required rows={4} placeholder="Message" className="input" />
                </ActionForm>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
