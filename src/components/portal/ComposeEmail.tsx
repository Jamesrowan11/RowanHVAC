"use client";

import { useActionState } from "react";
import { composeEmail, type ComposeState } from "@/app/actions/email";

const initial: ComposeState = { ok: false };

type Option = { id: string; name: string; email: string; role: string };

export function ComposeEmail({ recipients }: { recipients: Option[] }) {
  const [state, action, pending] = useActionState(composeEmail, initial);

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
          {state.message}
        </p>
      )}

      <div>
        <label className="label" htmlFor="userIds">
          Portal recipients{" "}
          <span className="font-normal text-navy-400">
            (Ctrl/Cmd-click to select multiple)
          </span>
        </label>
        <select
          id="userIds"
          name="userIds"
          multiple
          className="input h-40"
        >
          {recipients.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} — {r.email} ({r.role.toLowerCase()})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="typedRecipients">
          Other addresses{" "}
          <span className="font-normal text-navy-400">(comma-separated)</span>
        </label>
        <input
          id="typedRecipients"
          name="typedRecipients"
          className="input"
          placeholder="someone@example.com, another@example.com"
        />
      </div>

      <div>
        <label className="label" htmlFor="subject">Subject</label>
        <input id="subject" name="subject" className="input" required />
      </div>

      <div>
        <label className="label" htmlFor="body">Message</label>
        <textarea id="body" name="body" rows={8} className="input" required />
        <p className="mt-1 text-xs text-navy-400">
          The company signature is appended automatically.
        </p>
      </div>

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Send Email"}
      </button>
    </form>
  );
}
