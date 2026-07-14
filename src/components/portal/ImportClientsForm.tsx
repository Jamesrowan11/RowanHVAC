"use client";

import { useActionState } from "react";
import { importClients, type ImportState } from "@/lib/actions/importClients";

/** CSV upload + per-row results (created / skipped with reasons). */
export default function ImportClientsForm() {
  const [state, formAction, pending] = useActionState(importClients, { ok: false } as ImportState);

  return (
    <div className="space-y-4">
      <form action={formAction} className="card max-w-xl space-y-3">
        <div>
          <label htmlFor="file" className="label">CSV file</label>
          <input id="file" name="file" type="file" accept=".csv,text/csv" required className="input" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" name="sendWelcome" className="h-4 w-4" />
          Email each new customer a welcome note (no passwords are sent)
        </label>
        {state.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Importing…" : "Import customers"}
        </button>
      </form>

      {state.ok && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card">
            <h2 className="font-bold text-green-700">✓ Created ({state.created?.length ?? 0})</h2>
            <ul className="mt-2 space-y-1 text-sm text-gray-700">
              {(state.created ?? []).map((line) => <li key={line}>{line}</li>)}
              {(state.created ?? []).length === 0 && <li className="text-gray-500">None.</li>}
            </ul>
          </section>
          <section className="card">
            <h2 className="font-bold text-amber-700">Skipped ({state.skipped?.length ?? 0})</h2>
            <ul className="mt-2 space-y-1 text-sm text-gray-700">
              {(state.skipped ?? []).map((line) => <li key={line}>{line}</li>)}
              {(state.skipped ?? []).length === 0 && <li className="text-gray-500">None — every row imported.</li>}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
