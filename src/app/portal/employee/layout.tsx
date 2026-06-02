import { requireRole } from "@/lib/session";
import { getUnreadCount } from "@/lib/messaging";
import { PortalShell, type NavItem } from "@/components/portal/PortalShell";

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("EMPLOYEE");
  const unread = await getUnreadCount(user.id);

  const nav: NavItem[] = [
    { href: "/portal/employee", label: "My Schedule" },
    { href: "/portal/employee/email", label: "Compose Email" },
    { href: "/portal/employee/announcements", label: "Announcements" },
    { href: "/portal/messages", label: "Messages", badge: unread },
    { href: "/portal/profile", label: "My Profile" },
  ];

  return (
    <PortalShell
      user={{ name: user.name, email: user.email, role: user.role }}
      nav={nav}
      roleLabel="Employee"
    >
      {children}
    </PortalShell>
  );
}
