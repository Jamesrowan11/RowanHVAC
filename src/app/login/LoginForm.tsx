"use client";

import { useActionState, useEffect, useState } from "react";
import { loginAction, type LoginState } from "@/lib/actions/auth";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [installed, setInstalled] = useState(false);

  // When launched as an installed app, default "keep me signed in" to on.
  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) setInstalled(true);
  }, []);

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          name="remember"
          checked={installed}
          onChange={(e) => setInstalled(e.target.checked)}
        />
        Keep me signed in on this device
      </label>
      {state.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-xs text-gray-500">
        On a shared or public computer, leave &ldquo;Keep me signed in&rdquo; unchecked —
        your session will end after 30 minutes of inactivity. On your own phone
        or the installed app, stay signed in.
      </p>
    </form>
  );
}
