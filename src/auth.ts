import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import {
  SESSION_IDLE_SECONDS,
  SESSION_MAX_SECONDS,
  SESSION_REMEMBER_IDLE_SECONDS,
  SESSION_REMEMBER_MAX_SECONDS,
  SESSION_COOKIE_MAX_SECONDS,
} from "@/lib/constants";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role: Role;
    remember?: boolean;
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
    // Cookie can live up to the longest possible ("keep me signed in") session;
    // the jwt callback enforces the real idle/absolute limits per session.
    maxAge: SESSION_COOKIE_MAX_SECONDS,
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
      credentials: { email: {}, password: {}, remember: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await db.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        const remember = String(credentials?.remember ?? "") === "true";
        return { id: user.id, name: user.name, email: user.email, role: user.role, remember };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const now = Math.floor(Date.now() / 1000);
      if (user) {
        token.uid = user.id;
        token.role = user.role;
        token.remember = !!user.remember;
        token.loginAt = now;
        token.lastSeen = now;
        return token;
      }
      const lastSeen = (token.lastSeen as number) ?? 0;
      const loginAt = (token.loginAt as number) ?? 0;
      // "Keep me signed in" (installed app / trusted device) gets a long
      // window; everyone else keeps the strict 30-min idle / 8-hour cap.
      const remember = token.remember === true;
      const idleLimit = remember ? SESSION_REMEMBER_IDLE_SECONDS : SESSION_IDLE_SECONDS;
      const maxLimit = remember ? SESSION_REMEMBER_MAX_SECONDS : SESSION_MAX_SECONDS;
      if (now - lastSeen > idleLimit) return null;
      if (now - loginAt > maxLimit) return null;
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
