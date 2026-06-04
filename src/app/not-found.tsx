import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-navy-50 px-4 text-center">
      <Logo />
      <h1 className="mt-8 text-5xl font-extrabold text-navy-900">404</h1>
      <p className="mt-3 max-w-md text-navy-600">
        Sorry, we couldn&apos;t find that page. It may have moved or no longer
        exists.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/" className="btn-primary">
          Back to Home
        </Link>
        <Link href="/portal" className="btn-outline">
          Go to Portal
        </Link>
      </div>
    </main>
  );
}
