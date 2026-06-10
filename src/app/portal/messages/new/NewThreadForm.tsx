"use client";

import { useActionState } from "react";
import { startThread } from "@/lib/actions/messages";
import type { ActionState } from "@/lib/actions/jobs";

type Group = { label: string; users: { id: string; name: string }[] };

export default function NewThreadForm({ groups }: { groups: Group[] | null }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(startThread, { ok: false });

  return (
    <form action={formAction} className="space-y-4">
      {groups ? (
        <div>
          <label htmlFor="recipientId" className="label">To</label>
          <select id="recipientId" name="recipientId" required className="input" defaultValue="">
            <option value="" disabled>Choose a recipient…</option>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      ) : (
        <p className="rounded-lg bg-navy-50 p-3 text-sm text-gray-700">
          Your message goes straight to the Rowan Heating &amp; Air office.
        </p>
      )}
      <div>
        <label htmlFor="subject" className="label">Subject</label>
        <input id="subject" name="subject" required maxLength={200} className="input" />
      </div>
      <div>
        <label htmlFor="body" className="label">Message</label>
        <textarea id="body" name="body" required rows={5} className="input" />
      </div>
      {state.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
