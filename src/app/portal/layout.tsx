import { requireUser } from "@/lib/session";
import { getUnreadCount } from "@/lib/messaging";
import { PortalShell, type NavItem } from "@/components/portal/PortalShell";

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  ADMIN: [
    { href: "/portal/admin", label: "Overview" },
    { href: "/portal/admin/requests", label: "Requests" },
    { href: "/portal/admin/schedule", label: "Scheduling" },
    { href: "/portal/admin/users", label: "Users" },
    { href: "/portal/admin/maintenance", label: "Maintenance" },
    { href: "/portal/admin/payments", label: "Payments & Docs" },
    { href: "/portal/admin/email", label: "Compose Email" },
    { href: "/portal/admin/announcements", label: "Announcements" },
    { href: "/portal/messages", label: "Messages" },
    { href: "/portal/profile", label: "My Profile" },
  ],
  EMPLOYEE: [
    { href: "/portal/employee", label: "My Schedule" },
    { href: "/portal/employee/email", label: "Compose Email" },
    { href: "/portal/employee/announcements", label: "Announcements" },
    { href: "/portal/messages", label: "Messages" },
    { href: "/portal/profile", label: "My Profile" },
  ],
  CLIENT: [
    { href: "/portal/client", label: "Appointments" },
    { href: "/portal/client/request", label: "New Request" },
    { href: "/portal/client/history", label: "Service History" },
    { href: "/portal/client/maintenance", label: "Maintenance" },
    { href: "/portal/client/documents", label: "Documents & Payments" },
    { href: "/portal/messages", label: "Messages" },
    { href: "/portal/profile", label: "My Profile" },
  ],
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  EMPLOYEE: "Employee",
  CLIENT: "Client",
};

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const unread = await getUnreadCount(user.id);

  const nav = NAV_BY_ROLE[user.role].map((item) =>
    item.href === "/portal/messages" ? { ...item, badge: unread } : item,
  );

  return (
    <PortalShell
      user={{ name: user.name, email: user.email, role: user.role }}
      nav={nav}
      roleLabel={ROLE_LABELS[user.role]}
    >
      {children}
    </PortalShell>
  );
}
