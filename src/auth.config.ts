import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

// Session security limits.
export const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutes idle
export const ABSOLUTE_LIMIT_MS = 8 * 60 * 60 * 1000; // 8 hours hard cap

/**
 * Edge-safe configuration shared between middleware and the full auth setup.
 * Contains NO Node-only code (no bcrypt / Prisma) so it can run in middleware.
 */
export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    // Absolute cookie lifetime. Inactivity is enforced separately below.
    maxAge: ABSOLUTE_LIMIT_MS / 1000,
  },
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      const now = Date.now();

      // Initial sign-in: stamp identity + activity timers.
      if (user) {
        token.id = user.id;
        token.role = user.role;
        if (user.name) token.name = user.name;
        token.loginAt = now;
        token.lastActivity = now;
        return token;
      }

      const loginAt = (token.loginAt as number) ?? now;
      const lastActivity = (token.lastActivity as number) ?? now;

      // Expire on inactivity or absolute cap. Returning null invalidates the session.
      if (
        now - lastActivity > INACTIVITY_LIMIT_MS ||
        now - loginAt > ABSOLUTE_LIMIT_MS
      ) {
        return null;
      }

      token.lastActivity = now;
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        if (token.name) session.user.name = token.name as string;
      }
      return session;
    },
  },
  providers: [], // real providers are attached in src/auth.ts (Node runtime)
} satisfies NextAuthConfig;
