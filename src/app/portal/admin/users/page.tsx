import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PageHeader } from "@/components/portal/ui";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import {
  createUser,
  updateUser,
  resetUserPassword,
  setUserActive,
  deleteUser,
} from "../actions";

const ROLE_STYLES: Record<string, string> = {
  ADMIN: "bg-accent/15 text-accent-700",
  EMPLOYEE: "bg-blue-100 text-blue-800",
  CLIENT: "bg-navy-100 text-navy-700",
};

export default async function UsersPage() {
  const admin = await requireRole("ADMIN");
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="Users & Employees"
        subtitle="Create accounts, manage details, reset passwords, and activate or deactivate access."
      />

      {/* Create */}
      <details className="card mb-6 p-6">
        <summary className="cursor-pointer text-lg font-semibold text-navy-900">
          Create a new account
        </summary>
        <form action={createUser} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="c-name">Name</label>
            <input id="c-name" name="name" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="c-email">Email</label>
            <input id="c-email" name="email" type="email" className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="c-phone">Phone</label>
            <input id="c-phone" name="phone" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="c-role">Role</label>
            <select id="c-role" name="role" className="input" defaultValue="CLIENT">
              <option value="CLIENT">Client</option>
              <option value="EMPLOYEE">Employee</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="c-personal">
              Personal email{" "}
              <span className="font-normal text-navy-400">
                (staff only — password-reset emails go here)
              </span>
            </label>
            <input id="c-personal" name="personalEmail" type="email" className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="c-password">Temporary password</label>
            <input
              id="c-password"
              name="password"
              type="text"
              className="input"
              minLength={8}
              required
              placeholder="At least 8 characters"
            />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">Create Account</button>
          </div>
        </form>
      </details>

      {/* List */}
      <div className="space-y-3">
        {users.map((u) => (
          <div key={u.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-navy-900">{u.name}</h3>
                  <span className={`badge ${ROLE_STYLES[u.role]}`}>{u.role}</span>
                  {!u.active && (
                    <span className="badge bg-red-100 text-red-700">Deactivated</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-navy-500">
                  {u.email}
                  {u.phone ? ` · ${u.phone}` : ""}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <form action={setUserActive}>
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="active" value={(!u.active).toString()} />
                  <button
                    type="submit"
                    className="btn-outline btn-sm"
                    disabled={u.id === admin.id}
                    title={u.id === admin.id ? "You can't change your own status here" : ""}
                  >
                    {u.active ? "Deactivate" : "Activate"}
                  </button>
                </form>
                <form action={deleteUser}>
                  <input type="hidden" name="id" value={u.id} />
                  <ConfirmButton
                    message="Delete this account permanently? Deactivating is usually preferred. Continue?"
                  >
                    Delete
                  </ConfirmButton>
                </form>
              </div>
            </div>

            <div className="mt-3 grid gap-3 border-t border-navy-100 pt-3 lg:grid-cols-2">
              {/* Edit */}
              <details>
                <summary className="cursor-pointer text-sm font-medium text-navy-700">
                  Edit details
                </summary>
                <form action={updateUser} className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={u.id} />
                  <div>
                    <label className="label">Name</label>
                    <input name="name" className="input" defaultValue={u.name} required />
                  </div>
                  <div>
                    <label className="label">Email</label>
                    <input name="email" type="email" className="input" defaultValue={u.email} required />
                  </div>
                  <div>
                    <label className="label">Phone</label>
                    <input name="phone" className="input" defaultValue={u.phone ?? ""} />
                  </div>
                  <div>
                    <label className="label">Role</label>
                    <select name="role" className="input" defaultValue={u.role}>
                      <option value="CLIENT">Client</option>
                      <option value="EMPLOYEE">Employee</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">
                      Personal email{" "}
                      <span className="font-normal text-navy-400">
                        (staff only — password resets sent here)
                      </span>
                    </label>
                    <input
                      name="personalEmail"
                      type="email"
                      className="input"
                      defaultValue={u.personalEmail ?? ""}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button type="submit" className="btn-navy btn-sm">Save</button>
                  </div>
                </form>
              </details>

              {/* Reset password */}
              <details>
                <summary className="cursor-pointer text-sm font-medium text-navy-700">
                  Set / reset password
                </summary>
                <form action={resetUserPassword} className="mt-3 flex items-end gap-2">
                  <input type="hidden" name="id" value={u.id} />
                  <div className="flex-1">
                    <label className="label">New password</label>
                    <input
                      name="password"
                      type="text"
                      className="input"
                      minLength={8}
                      required
                      placeholder="At least 8 characters"
                    />
                  </div>
                  <button type="submit" className="btn-navy btn-sm">Set</button>
                </form>
              </details>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
