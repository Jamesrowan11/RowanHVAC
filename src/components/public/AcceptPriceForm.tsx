"use client";

import { useActionState } from "react";
import { acceptPrice } from "@/lib/actions/accept";

/** Checkbox + typed-signature acceptance form on the public quote page. */
export default function AcceptPriceForm({ token, price }: { token: string; price: string }) {
  const [state, formAction, pending] = useActionState(acceptPrice, { ok: false });

  if (state.ok) {
    return (
      <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800">
        <p className="font-semibold">✓ Price accepted — thank you!</p>
        <p className="mt-1">We&apos;ll see you at your appointment. A copy of your acceptance is on file.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <label className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 text-sm">
        <input type="checkbox" name="agree" required className="mt-0.5 h-4 w-4" />
        <span>
          I accept the quoted price of <span className="font-bold text-navy">{price}</span> for this service.
        </span>
      </label>

      <div>
        <label htmlFor="signature" className="label">Sign by typing your full name</label>
        <input
          id="signature"
          name="signature"
          required
          minLength={2}
          placeholder="Your full name"
          autoComplete="name"
          className="input font-serif italic"
        />
      </div>

      {state.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Submitting…" : "Accept price"}
      </button>
    </form>
  );
}
