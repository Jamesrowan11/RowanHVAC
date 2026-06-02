"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-navy-50 px-4 text-center">
      <h1 className="text-3xl font-bold text-navy-900">Something went wrong</h1>
      <p className="mt-3 max-w-md text-navy-600">
        An unexpected error occurred. Please try again, or call us at{" "}
        <a className="font-semibold text-accent" href="tel:+14105310008">
          410-531-0008
        </a>
        .
      </p>
      <button onClick={reset} className="btn-primary mt-6">
        Try Again
      </button>
    </main>
  );
}
