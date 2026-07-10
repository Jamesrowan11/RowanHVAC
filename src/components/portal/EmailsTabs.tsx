"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/portal/admin/emails", label: "Compose & History" },
  { href: "/portal/admin/emails/accounts", label: "Accounts" },
  { href: "/portal/admin/emails/unmatched", label: "Unmatched Inbox" },
  { href: "/portal/admin/emails/signature", label: "Signature" },
];

export default function EmailsTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Email sections" className="border-b border-navy-100">
      <ul className="flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const active = tab.href === "/portal/admin/emails" ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`block whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "border-accent-600 text-accent-600"
                    : "border-transparent text-gray-500 hover:text-navy"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
