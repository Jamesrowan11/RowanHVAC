"use client";

import { useActionState } from "react";
import { acceptTerms } from "@/lib/actions/accept";

/** Checkbox + typed-signature acceptance form at the bottom of the terms page. */
export default function AcceptTermsForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(acceptTerms, { ok: false });

  if (state.ok) {
    return (
      <div className="rounded-lg bg-green-50 p-4 text-sm text-green-800">
        <p className="font-semibold">✓ Accepted — thank you!</p>
        <p className="mt-1">We&apos;ll see you at your appointment. A copy of your acceptance is on file.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <fieldset className="rounded-lg border border-gray-200 p-3">
        <legend className="px-1 text-sm font-semibold text-navy">How will you be paying at time of service?</legend>
        <p className="mb-2 text-xs text-gray-500">
          Our technician will have a credit card slider. Without a payment answer we
          can&apos;t dispatch a technician.
        </p>
        <label className="flex items-center gap-2 py-1 text-sm">
          <input type="radio" name="paymentMethod" value="CHECK" required className="h-4 w-4" />
          <span>Pay by <span className="font-medium text-navy">check</span> at time of service</span>
        </label>
        <label className="flex items-center gap-2 py-1 text-sm">
          <input type="radio" name="paymentMethod" value="CREDIT" required className="h-4 w-4" />
          <span>Pay by <span className="font-medium text-navy">credit card</span> at time of service</span>
        </label>
      </fieldset>

      <label className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 text-sm">
        <input type="checkbox" name="agree" required className="mt-0.5 h-4 w-4" />
        <span>
          I have read and agree to the <span className="font-semibold text-navy">scheduling letter</span> and
          the <span className="font-semibold text-navy">hourly pricing terms</span> above.
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
        {pending ? "Submitting…" : "Accept & sign"}
      </button>
    </form>
  );
}
