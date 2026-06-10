import Link from "next/link";
import { requireUser } from "@/lib/guards";
import { unreadMessageCount } from "@/lib/queries";
import { logoutAction } from "@/lib/actions/auth";

const navByRole = {
  ADMIN: [
    { href: "/portal/admin", label: "Overview" },
    { href: "/portal/admin/requests", label: "Requests" },
    { href: "/portal/admin/schedule", label: "Schedule" },
    { href: "/portal/admin/users", label: "Users" },
    { href: "/portal/messages", label: "Messages", badge: true },
    { href: "/portal/admin/email", label: "Email" },
    { href: "/portal/admin/announcements", label: "Announcements" },
    { href: "/portal/admin/team", label: "Our Techs" },
    { href: "/portal/admin/unmatched", label: "Unmatched Inbox" },
    { href: "/portal/admin/signature", label: "Signature" },
    { href: "/portal/profile", label: "My Profile" },
  ],
  EMPLOYEE: [
    { href: "/portal/employee", label: "My Schedule" },
    { href: "/portal/messages", label: "Messages", badge: true },
    { href: "/portal/employee/email", label: "Email" },
    { href: "/portal/employee/announcements", label: "Announcements" },
    { href: "/portal/profile", label: "My Profile" },
  ],
  CLIENT: [
    { href: "/portal/client", label: "Appointments" },
    { href: "/portal/client/request", label: "New Request" },
    { href: "/portal/client/history", label: "Service History" },
    { href: "/portal/client/billing", label: "Documents & Payments" },
    { href: "/portal/messages", label: "Messages", badge: true },
    { href: "/portal/profile", label: "My Profile" },
  ],
} as const;

const roleLabels = { ADMIN: "Admin", EMPLOYEE: "Employee", CLIENT: "Customer" } as const;

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await unreadMessageCount(user.id);
  const nav = navByRole[user.role];

  return (
    <div className="min-h-screen bg-navy-50">
      <header className="border-b border-navy-100 bg-navy text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <Link href="/portal" className="font-extrabold tracking-tight">
            Rowan <span className="text-accent-300">Heating &amp; Air</span>
            <span className="ml-2 rounded bg-navy-700 px-2 py-0.5 text-xs font-semibold text-navy-100">
              {roleLabels[user.role]} Portal
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-navy-100 sm:block">{user.name}</span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md border border-navy-500 px-3 py-1.5 text-sm font-medium text-navy-100 transition hover:bg-navy-700"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
        <nav aria-label="Portal navigation" className="mx-auto max-w-6xl overflow-x-auto px-4">
          <ul className="flex gap-1 pb-2">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-navy-100 transition hover:bg-navy-700 hover:text-white"
                >
                  {item.label}
                  {"badge" in item && item.badge && unread > 0 && (
                    <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                      {unread}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
