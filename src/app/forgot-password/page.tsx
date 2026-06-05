import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot Password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-navy-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="card p-8">
          <h1 className="text-xl font-bold text-navy-900">Forgot your password?</h1>
          <p className="mt-1 text-sm text-navy-500">
            Enter your account email and we&apos;ll send you a link to reset it.
          </p>
          <div className="mt-6">
            <ForgotPasswordForm />
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-navy-500">
          <Link href="/login" className="hover:text-accent">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
