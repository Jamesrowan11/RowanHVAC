"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import { logout } from "@/app/portal/actions";

export type NavItem = {
  href: string;
  label: string;
  badge?: number;
};

export function PortalShell({
  user,
  nav,
  roleLabel,
  children,
}: {
  user: { name: string; email: string; role: string };
  nav: NavItem[];
  roleLabel: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== "/portal" && pathname.startsWith(href + "/"));

  return (
    <div className="min-h-screen bg-navy-50">
      <a href="#portal-main" className="skip-link">
        Skip to main content
      </a>

      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-navy-100 bg-white">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg p-2 text-navy-700 hover:bg-navy-50 lg:hidden"
              onClick={() => setOpen((o) => !o)}
              aria-label="Toggle navigation"
              aria-expanded={open}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              </svg>
            </button>
            <Logo href="/portal" />
            <span className="badge bg-navy-100 text-navy-700">{roleLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-navy-900">{user.name}</p>
              <p className="text-xs text-navy-500">{user.email}</p>
            </div>
            <form action={logout}>
              <button type="submit" className="btn-outline btn-sm">
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        {/* Sidebar */}
        <aside
          className={`${
            open ? "block" : "hidden"
          } fixed inset-x-0 top-[57px] z-30 border-b border-navy-100 bg-white p-4 lg:static lg:block lg:w-60 lg:shrink-0 lg:border-0 lg:bg-transparent lg:p-0`}
        >
          <nav className="space-y-1" aria-label="Portal">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive(item.href)
                    ? "bg-navy-900 text-white"
                    : "text-navy-700 hover:bg-white hover:shadow-card"
                }`}
              >
                <span>{item.label}</span>
                {item.badge ? (
                  <span className="badge bg-accent text-white">{item.badge}</span>
                ) : null}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main id="portal-main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
