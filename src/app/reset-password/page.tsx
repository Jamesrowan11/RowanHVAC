import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Reset Password",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-navy-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="card p-8">
          <h1 className="text-xl font-bold text-navy-900">Choose a new password</h1>
          {token ? (
            <div className="mt-6">
              <ResetPasswordForm token={token} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-red-700">
              This link is missing its reset token. Please use the link from your
              email, or{" "}
              <Link href="/forgot-password" className="underline">
                request a new one
              </Link>
              .
            </p>
          )}
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
