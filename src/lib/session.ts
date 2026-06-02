import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Role, User } from "@prisma/client";

/**
 * Server-side access control helpers. These resolve the *current database user*
 * from the session and are the single source of truth for who the caller is.
 * Every page loader, server action, and API route must use these — never trust
 * the client.
 */

export type SessionUser = Pick<
  User,
  "id" | "name" | "email" | "phone" | "role" | "active"
>;

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      active: true,
    },
  });

  // Account deactivated mid-session → treat as logged out.
  if (!user || !user.active) return null;
  return user;
}

/** Require any authenticated, active user. Redirects to /login otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Require one of the allowed roles. Redirects to the caller's own dashboard. */
export async function requireRole(
  ...roles: Role[]
): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect(dashboardPath(user.role));
  }
  return user;
}

export function dashboardPath(role: Role): string {
  switch (role) {
    case "ADMIN":
      return "/portal/admin";
    case "EMPLOYEE":
      return "/portal/employee";
    default:
      return "/portal/client";
  }
}

/** Thrown-style guard for server actions: returns user or throws Forbidden. */
export async function assertRole(...roles: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (!roles.includes(user.role)) throw new Error("Forbidden");
  return user;
}
