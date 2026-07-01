"use client";

import { useActionState } from "react";
import { submitQuoteRequest, type QuoteFormState } from "@/lib/actions/public";
import { SERVICE_OPTIONS } from "@/lib/constants";

const initialState: QuoteFormState = { ok: false };

export default function ContactForm({ submitLabel = "Request a Service" }: { submitLabel?: string }) {
  const [state, formAction, pending] = useActionState(submitQuoteRequest, initialState);

  if (state.ok) {
    return (
      <div className="card border border-green-200 bg-green-50 text-center">
        <h3 className="text-xl font-bold text-navy">Thank you!</h3>
        <p className="mt-2 text-gray-700">
          We received your request and will get back to you as soon as possible —
          usually the same business day.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="card space-y-4 text-left">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="label">Name</label>
          <input id="name" name="name" required maxLength={120} className="input" autoComplete="name" />
        </div>
        <div>
          <label htmlFor="phone" className="label">Phone</label>
          <input id="phone" name="phone" type="tel" required maxLength={30} className="input" autoComplete="tel" />
        </div>
      </div>
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" required maxLength={200} className="input" autoComplete="email" />
      </div>
      <div>
        <label htmlFor="service" className="label">Service needed</label>
        <select id="service" name="service" required className="input" defaultValue="">
          <option value="" disabled>Select a service…</option>
          {SERVICE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="message" className="label">How can we help?</label>
        <textarea id="message" name="message" required rows={4} maxLength={5000} className="input" />
      </div>
      {state.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
        {pending ? "Sending…" : submitLabel}
      </button>
    </form>
  );
}
