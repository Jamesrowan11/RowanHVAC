import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import { SESSION_IDLE_SECONDS, SESSION_MAX_SECONDS } from "@/lib/constants";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role: Role;
  }
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: Role;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: {
    strategy: "jwt",
    // Cookie lifetime matches the inactivity window; it is refreshed on
    // activity, so an idle browser is logged out after ~30 minutes.
    maxAge: SESSION_IDLE_SECONDS,
  },
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      },
    },
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await db.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const now = Math.floor(Date.now() / 1000);
      if (user) {
        token.uid = user.id;
        token.role = user.role;
        token.loginAt = now;
        token.lastSeen = now;
        return token;
      }
      const lastSeen = (token.lastSeen as number) ?? 0;
      const loginAt = (token.loginAt as number) ?? 0;
      // Inactivity timeout (~30 min) and absolute lifetime (~8 h).
      if (now - lastSeen > SESSION_IDLE_SECONDS) return null;
      if (now - loginAt > SESSION_MAX_SECONDS) return null;
      token.lastSeen = now;
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
});
