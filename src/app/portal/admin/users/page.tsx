import Link from "next/link";
import { requireRole } from "@/lib/guards";
import { db } from "@/lib/db";
import { createUser } from "@/lib/actions/users";
import ActionForm from "@/components/portal/ActionForm";

export const metadata = { title: "Users" };

export default async function AdminUsers() {
  await requireRole("ADMIN");

  const users = await db.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const groups = [
    { label: "Admins", items: users.filter((u) => u.role === "ADMIN") },
    { label: "Employees", items: users.filter((u) => u.role === "EMPLOYEE") },
    { label: "Clients", items: users.filter((u) => u.role === "CLIENT") },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-navy">Users &amp; Accounts</h1>

      <section className="card max-w-2xl">
        <h2 className="font-bold text-navy">Create account</h2>
        <ActionForm
          action={createUser}
          submitLabel="Create account"
          pendingLabel="Creating…"
          successMessage="Account created — a welcome email was sent."
          buttonClassName="btn-primary"
          className="mt-4 space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="new-name" className="label">Name</label>
              <input id="new-name" name="name" required className="input" />
            </div>
            <div>
              <label htmlFor="new-email" className="label">Email</label>
              <input id="new-email" name="email" type="email" required className="input" />
            </div>
            <div>
              <label htmlFor="new-phone" className="label">Phone</label>
              <input id="new-phone" name="phone" className="input" />
            </div>
            <div>
              <label htmlFor="new-role" className="label">Role</label>
              <select id="new-role" name="role" required className="input" defaultValue="CLIENT">
                <option value="CLIENT">Client</option>
                <option value="EMPLOYEE">Employee</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="new-address" className="label">Address (clients)</label>
            <input id="new-address" name="address" className="input" />
          </div>
          <div>
            <label htmlFor="new-password" className="label">Initial password (min 8 characters)</label>
            <input id="new-password" name="password" type="password" required minLength={8} className="input" />
          </div>
        </ActionForm>
      </section>

      {groups.map((g) => (
        <section key={g.label}>
          <h2 className="text-lg font-bold text-navy">{g.label}</h2>
          <div className="mt-3 overflow-x-auto rounded-xl bg-white shadow-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"><span className="sr-only">Manage</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {g.items.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-4 text-gray-500">None yet.</td></tr>
                )}
                {g.items.map((u) => (
                  <tr key={u.id} className="hover:bg-navy-50/50">
                    <td className="px-4 py-3 font-medium text-navy">{u.name}</td>
                    <td className="px-4 py-3">{u.email}</td>
                    <td className="px-4 py-3">{u.phone ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${u.active ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"}`}>
                        {u.active ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/portal/admin/users/${u.id}`} className="font-medium text-accent-600 hover:underline">
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
