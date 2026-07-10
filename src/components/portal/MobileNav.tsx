"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";

/** Icon set (inline SVG so there's no dependency). */
const icons: Record<string, React.ReactNode> = {
  home: <path d="M3 11l9-8 9 8M5 10v10h14V10" />,
  calendar: <path d="M4 5h16v16H4zM4 9h16M8 3v4M16 3v4" />,
  chat: <path d="M21 12a8 8 0 01-11.6 7.1L3 21l1.9-6.4A8 8 0 1121 12z" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  user: <path d="M20 21a8 8 0 10-16 0M12 11a4 4 0 100-8 4 4 0 000 8z" />,
  doc: <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  wrench: <path d="M14.7 6.3a4 4 0 01-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 015.4-5.4l-2.3 2.3-2-2 2.3-2.3z" />,
};

type Item = { href: string; label: string; icon: keyof typeof icons; badge?: boolean };

const navByRole: Record<Role, Item[]> = {
  ADMIN: [
    { href: "/portal/admin", label: "Home", icon: "home" },
    { href: "/portal/admin/requests", label: "Requests", icon: "list" },
    { href: "/portal/admin/schedule", label: "Schedule", icon: "calendar" },
    { href: "/portal/messages", label: "Messages", icon: "chat", badge: true },
    { href: "/portal/profile", label: "Profile", icon: "user" },
  ],
  EMPLOYEE: [
    { href: "/portal/employee", label: "Schedule", icon: "wrench" },
    { href: "/portal/employee/tickets", label: "Tickets", icon: "doc" },
    { href: "/portal/calendar", label: "Calendar", icon: "calendar" },
    { href: "/portal/messages", label: "Messages", icon: "chat", badge: true },
    { href: "/portal/profile", label: "Profile", icon: "user" },
  ],
  CLIENT: [
    { href: "/portal/client", label: "Home", icon: "home" },
    { href: "/portal/client/request", label: "Request", icon: "plus" },
    { href: "/portal/client/billing", label: "Billing", icon: "doc" },
    { href: "/portal/messages", label: "Messages", icon: "chat", badge: true },
    { href: "/portal/profile", label: "Profile", icon: "user" },
  ],
};

export default function MobileNav({ role, unread }: { role: Role; unread: number }) {
  const pathname = usePathname();
  const items = navByRole[role];

  const isActive = (href: string) =>
    pathname === href || (href !== "/portal/admin" && href !== "/portal/client" && pathname.startsWith(href));

  return (
    <nav
      aria-label="App navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-navy-100 bg-white shadow-[0_-2px_10px_rgba(13,22,38,0.06)] sm:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
                  active ? "text-accent-600" : "text-navy-400"
                }`}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                >
                  {icons[item.icon]}
                </svg>
                {item.label}
                {item.badge && unread > 0 && (
                  <span className="absolute right-1/2 top-1 translate-x-3 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
