"use client";

import { useActionState } from "react";
import type { ImportResult } from "./actions";

export function ImportForm({
  action,
  title,
  description,
  extraOption,
}: {
  action: (prev: ImportResult | null, formData: FormData) => Promise<ImportResult>;
  title: string;
  description: React.ReactNode;
  extraOption?: { name: string; label: string; defaultChecked?: boolean };
}) {
  const [result, formAction, pending] = useActionState(action, null);
  return (
    <div className="card p-6">
      <h2 className="mb-1 text-lg font-semibold text-navy-900">{title}</h2>
      <div className="mb-4 text-sm text-navy-600">{description}</div>
      <form action={formAction} className="space-y-3">
        <input type="file" name="file" accept=".csv,text/csv,.txt" required className="input" />
        <label className="flex items-center gap-2 text-sm text-navy-700">
          <input type="checkbox" name="dryRun" defaultChecked /> Test run first (shows what would happen, saves nothing)
        </label>
        {extraOption && (
          <label className="flex items-center gap-2 text-sm text-navy-700">
            <input type="checkbox" name={extraOption.name} defaultChecked={extraOption.defaultChecked} /> {extraOption.label}
          </label>
        )}
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Reading the file…" : "Upload"}
        </button>
      </form>

      {result && (
        <div
          className={`mt-5 rounded-lg border p-4 text-sm ${
            result.dryRun ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"
          }`}
        >
          {result.rows > 0 && (
            <p className="mb-2 font-semibold text-navy-900">
              {result.dryRun
                ? `Test run: ${result.rows} rows read. Nothing was saved. Untick "Test run" and upload again to import.`
                : `Done: ${result.rows} rows read.`}
            </p>
          )}
          {result.lines.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-navy-800">
              {result.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
          {result.columns.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-navy-600">Columns used</summary>
              <ul className="mt-1 list-disc pl-5 text-xs text-navy-600">
                {result.columns.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </details>
          )}
          {result.problems.length > 0 && (
            <div className="mt-3">
              <p className="font-medium text-red-700">Needs a look:</p>
              <ul className="list-disc pl-5 text-xs text-red-700">
                {result.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
