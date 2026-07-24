import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { Role, User } from "@prisma/client";

/**
 * Server-side access control. Every page loader, server action, and API
 * route that touches protected data goes through these helpers — security
 * is enforced on the data, never just in the UI.
 */

export async function currentUser(): Promise<User | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  // A deactivated account loses access immediately, even mid-session.
  if (!user || !user.active) return null;
  return user;
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<User> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    // Don't reveal that the resource exists.
    notFound();
  }
  return user;
}

/** Action-flavored guards: throw instead of redirect (for server actions). */
export async function actionUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

export async function actionRole(...roles: Role[]): Promise<User> {
  const user = await actionUser();
  if (!roles.includes(user.role)) throw new Error("Forbidden");
  return user;
}
