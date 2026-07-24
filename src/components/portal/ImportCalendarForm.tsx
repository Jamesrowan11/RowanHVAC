"use client";

import { useActionState } from "react";
import { importCalendar, type CalendarImportState } from "@/lib/actions/importCalendar";

/** Google Calendar .ics upload with an import summary. */
export default function ImportCalendarForm() {
  const [state, formAction, pending] = useActionState(importCalendar, { ok: false } as CalendarImportState);

  return (
    <div className="space-y-4">
      <form action={formAction} className="card max-w-xl space-y-3">
        <div>
          <label htmlFor="file" className="label">Calendar file (.ics)</label>
          <input id="file" name="file" type="file" accept=".ics,text/calendar" required className="input" />
        </div>
        {state.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Importing — this can take a minute…" : "Import calendar"}
        </button>
      </form>

      {state.ok && (
        <section className="card max-w-xl">
          <h2 className="font-bold text-green-700">✓ Imported {state.imported} event{state.imported === 1 ? "" : "s"}</h2>
          <ul className="mt-2 space-y-1 text-sm text-gray-700">
            {(state.duplicates ?? 0) > 0 && <li>{state.duplicates} duplicates skipped (already imported or repeated in the file) — re-running is always safe.</li>}
            {(state.cancelled ?? 0) > 0 && <li>{state.cancelled} cancelled events skipped.</li>}
            {(state.recurring ?? 0) > 0 && (
              <li>{state.recurring} repeating events were imported as a single entry (repeats aren&apos;t expanded — duplicate them from the calendar search as needed).</li>
            )}
          </ul>
          {(state.samples ?? []).length > 0 && (
            <>
              <p className="mt-3 text-xs font-bold uppercase tracking-wide text-gray-500">First few imported</p>
              <ul className="mt-1 space-y-0.5 text-sm text-gray-700">
                {(state.samples ?? []).map((s) => <li key={s}>{s}</li>)}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
