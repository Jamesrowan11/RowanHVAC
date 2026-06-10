"use client";

import { useActionState } from "react";
import { submitPortalRequest, scheduleMaintenance, type RequestFormState } from "@/lib/actions/requests";
import { SERVICE_OPTIONS } from "@/lib/constants";

const initial: RequestFormState = { ok: false };

export function ServiceRequestForm() {
  const [state, formAction, pending] = useActionState(submitPortalRequest, initial);

  if (state.ok) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        Request received! We&apos;ll be in touch shortly to get you scheduled.
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
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
        <label htmlFor="message" className="label">What&apos;s going on?</label>
        <textarea id="message" name="message" required rows={4} className="input" />
      </div>
      {state.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
        {pending ? "Sending…" : "Submit request"}
      </button>
    </form>
  );
}

export function MaintenanceForm() {
  const [state, formAction, pending] = useActionState(scheduleMaintenance, initial);

  if (state.ok) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        Maintenance request received! The office will confirm your appointment time.
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="preferred" className="label">Preferred days / times</label>
        <input id="preferred" name="preferred" placeholder="Weekday mornings, after June 20…" className="input" />
      </div>
      <div>
        <label htmlFor="notes" className="label">Anything we should know? (optional)</label>
        <textarea id="notes" name="notes" rows={3} className="input" />
      </div>
      {state.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
        {pending ? "Sending…" : "Request maintenance visit"}
      </button>
    </form>
  );
}
