"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordWithToken, type ResetState } from "./actions";

const initial: ResetState = { ok: false };

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(
    resetPasswordWithToken,
    initial,
  );

  if (state.ok && state.message) {
    return (
      <div className="space-y-4">
        <p
          className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700"
          role="status"
        >
          {state.message}
        </p>
        <Link href="/login" className="btn-primary w-full">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      <div>
        <label className="label" htmlFor="password">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="confirm">
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          className="input"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : "Reset password"}
      </button>
    </form>
  );
}
