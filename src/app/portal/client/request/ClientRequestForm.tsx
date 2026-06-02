"use client";

import { useActionState } from "react";
import {
  submitClientRequest,
  type ClientRequestState,
} from "../actions";
import { SERVICE_OPTIONS } from "@/lib/company";

const initial: ClientRequestState = { ok: false };

export function ClientRequestForm() {
  const [state, action, pending] = useActionState(submitClientRequest, initial);

  if (state.ok) {
    return (
      <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
        Thanks — your request has been submitted. We&apos;ll be in touch soon.
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      <div>
        <label className="label" htmlFor="serviceNeeded">Service needed</label>
        <select id="serviceNeeded" name="serviceNeeded" className="input" defaultValue="">
          <option value="" disabled>Choose a service…</option>
          {SERVICE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="message">Details (optional)</label>
        <textarea id="message" name="message" rows={4} className="input" />
      </div>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Submitting…" : "Submit Request"}
      </button>
    </form>
  );
}
