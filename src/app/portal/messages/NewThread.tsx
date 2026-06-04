"use client";

import { useActionState } from "react";
import { startConversation, type NewThreadState } from "./actions";

const initial: NewThreadState = { ok: false };

type Option = { id: string; name: string; email: string; role: string };

export function NewThread({
  canPickRecipients,
  recipients,
}: {
  canPickRecipients: boolean;
  recipients: Option[];
}) {
  const [state, action] = useActionState(startConversation, initial);

  return (
    <details className="card p-6">
      <summary className="cursor-pointer text-lg font-semibold text-navy-900">
        Start a new message
      </summary>
      <form action={action} className="mt-4 space-y-4">
        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {state.error}
          </p>
        )}

        {canPickRecipients ? (
          <div>
            <label className="label" htmlFor="recipientIds">
              To{" "}
              <span className="font-normal text-navy-400">
                (Ctrl/Cmd-click to select multiple)
              </span>
            </label>
            <select id="recipientIds" name="recipientIds" multiple className="input h-40">
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — {r.role.toLowerCase()}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="rounded-lg bg-navy-50 px-3 py-2 text-sm text-navy-600">
            Your message will be sent securely to the Rowan team.
          </p>
        )}

        <div>
          <label className="label" htmlFor="subject">Subject (optional)</label>
          <input id="subject" name="subject" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="body">Message</label>
          <textarea id="body" name="body" rows={4} className="input" required />
        </div>
        <button type="submit" className="btn-primary">Send</button>
      </form>
    </details>
  );
}
