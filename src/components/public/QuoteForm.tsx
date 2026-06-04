"use client";

import { useActionState } from "react";
import { submitQuoteRequest, type QuoteFormState } from "@/app/actions/public";
import { SERVICE_OPTIONS } from "@/lib/company";

const initial: QuoteFormState = { ok: false };

export function QuoteForm() {
  const [state, action, pending] = useActionState(submitQuoteRequest, initial);

  if (state.ok) {
    return (
      <div
        className="rounded-xl border border-green-200 bg-green-50 p-6 text-center"
        role="status"
      >
        <h3 className="text-lg font-semibold text-green-800">
          Thank you — we&apos;ve received your request.
        </h3>
        <p className="mt-2 text-sm text-green-700">
          A member of the Rowan family will reach out to you soon. For urgent
          needs, please call us at{" "}
          <a className="font-semibold underline" href="tel:+14105310008">
            410-531-0008
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && (
        <p
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {state.error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="q-name">
            Name
          </label>
          <input id="q-name" name="name" className="input" autoComplete="name" />
          {state.fieldErrors?.name && (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.name}</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="q-phone">
            Phone
          </label>
          <input
            id="q-phone"
            name="phone"
            className="input"
            autoComplete="tel"
            inputMode="tel"
          />
          {state.fieldErrors?.phone && (
            <p className="mt-1 text-xs text-red-600">
              {state.fieldErrors.phone}
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="q-email">
          Email
        </label>
        <input
          id="q-email"
          name="email"
          type="email"
          className="input"
          autoComplete="email"
        />
        {state.fieldErrors?.email && (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.email}</p>
        )}
      </div>

      <div>
        <label className="label" htmlFor="q-service">
          Service needed
        </label>
        <select id="q-service" name="serviceNeeded" className="input" defaultValue="">
          <option value="" disabled>
            Choose a service…
          </option>
          {SERVICE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {state.fieldErrors?.serviceNeeded && (
          <p className="mt-1 text-xs text-red-600">
            {state.fieldErrors.serviceNeeded}
          </p>
        )}
      </div>

      <div>
        <label className="label" htmlFor="q-message">
          Message <span className="font-normal text-navy-400">(optional)</span>
        </label>
        <textarea
          id="q-message"
          name="message"
          rows={4}
          className="input"
          placeholder="Tell us a bit about what's going on…"
        />
      </div>

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Sending…" : "Request a Quote"}
      </button>
    </form>
  );
}
