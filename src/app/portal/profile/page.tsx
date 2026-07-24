import { requireUser } from "@/lib/guards";
import { updateOwnProfile, changeOwnPassword } from "@/lib/actions/profile";
import ActionForm from "@/components/portal/ActionForm";

export const metadata = { title: "My Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  // Always the session user — this page can never edit anyone else.
  const user = await requireUser();

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
              <>
                <div>
                  <label htmlFor="address" className="label">Service address</label>
                  <input id="address" name="address" defaultValue={user.address ?? ""} className="input" />
                </div>
                <div>
                  <label htmlFor="billingEmail" className="label">Billing email (for invoices — optional)</label>
                  <input
                    id="billingEmail"
                    name="billingEmail"
                    type="email"
                    defaultValue={user.billingEmail ?? ""}
                    placeholder="Where we should email invoices"
                    className="input"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Invoices and payment links go here (and to your account email). Leave blank to use your account email only.
                  </p>
                </div>
              </>
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
    </div>
  );
}
