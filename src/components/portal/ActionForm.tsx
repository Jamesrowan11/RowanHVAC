"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ActionState } from "@/lib/actions/jobs";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  successMessage?: string;
  resetOnSuccess?: boolean;
  className?: string;
  buttonClassName?: string;
};

/** Generic wrapper for server-action forms: pending state, error, success, reset. */
export default function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
  successMessage,
  resetOnSuccess = true,
  className,
  buttonClassName = "btn-small",
}: Props) {
  const [state, formAction, pending] = useActionState(action, { ok: false });
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state.error && <p className="mt-2 text-sm font-medium text-red-600">{state.error}</p>}
      {state.ok && successMessage && (
        <p className="mt-2 text-sm font-medium text-green-700">{successMessage}</p>
      )}
      <button type="submit" disabled={pending} className={`mt-3 ${buttonClassName}`}>
        {pending ? (pendingLabel ?? "Working…") : submitLabel}
      </button>
    </form>
  );
}
