"use client";

import { useActionState } from "react";
import { requestPasswordReset, type ForgotState } from "./actions";

const initial: ForgotState = { ok: false };

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  if (state.ok && state.message) {
    return (
      <p
        className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700"
        role="status"
      >
        {state.message}
      </p>
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
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="input"
          autoComplete="email"
          required
        />
      </div>
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
