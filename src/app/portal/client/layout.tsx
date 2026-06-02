import { requireRole } from "@/lib/session";
import { getUnreadCount } from "@/lib/messaging";
import { PortalShell, type NavItem } from "@/components/portal/PortalShell";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("CLIENT");
  const unread = await getUnreadCount(user.id);

  const nav: NavItem[] = [
    { href: "/portal/client", label: "Appointments" },
    { href: "/portal/client/request", label: "New Request" },
    { href: "/portal/client/history", label: "Service History" },
    { href: "/portal/client/maintenance", label: "Maintenance" },
    { href: "/portal/client/documents", label: "Documents & Payments" },
    { href: "/portal/messages", label: "Messages", badge: unread },
    { href: "/portal/profile", label: "My Profile" },
  ];

  return (
    <PortalShell
      user={{ name: user.name, email: user.email, role: user.role }}
      nav={nav}
      roleLabel="Client"
    >
      {children}
    </PortalShell>
  );
}
