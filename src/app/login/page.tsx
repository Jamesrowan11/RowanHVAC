import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getCurrentUser, dashboardPath } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Portal Login",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(dashboardPath(user.role));

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-navy-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="card p-8">
          <h1 className="text-xl font-bold text-navy-900">Portal Login</h1>
          <p className="mt-1 text-sm text-navy-500">
            Sign in to your Rowan account.
          </p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-navy-500">
          <Link href="/" className="hover:text-accent">
            ← Back to rowanhvac.com
          </Link>
        </p>
      </div>
    </main>
  );
}
