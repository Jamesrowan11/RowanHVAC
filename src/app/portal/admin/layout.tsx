import { requireRole } from "@/lib/session";
import { getUnreadCount } from "@/lib/messaging";
import { PortalShell, type NavItem } from "@/components/portal/PortalShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("ADMIN");
  const unread = await getUnreadCount(user.id);

  const nav: NavItem[] = [
    { href: "/portal/admin", label: "Overview" },
    { href: "/portal/admin/requests", label: "Requests" },
    { href: "/portal/admin/schedule", label: "Scheduling" },
    { href: "/portal/admin/users", label: "Users" },
    { href: "/portal/admin/maintenance", label: "Maintenance" },
    { href: "/portal/admin/payments", label: "Payments & Docs" },
    { href: "/portal/admin/email", label: "Compose Email" },
    { href: "/portal/admin/announcements", label: "Announcements" },
    { href: "/portal/messages", label: "Messages", badge: unread },
    { href: "/portal/profile", label: "My Profile" },
  ];

  return (
    <PortalShell
      user={{ name: user.name, email: user.email, role: user.role }}
      nav={nav}
      roleLabel="Admin"
    >
      {children}
    </PortalShell>
  );
}
