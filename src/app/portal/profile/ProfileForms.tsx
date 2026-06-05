"use client";

import { useActionState } from "react";
import {
  updateProfile,
  changePassword,
  type ProfileState,
} from "./actions";

const initial: ProfileState = { ok: false };

function Flash({ state }: { state: ProfileState }) {
  if (state.error)
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
        {state.error}
      </p>
    );
  if (state.ok && state.message)
    return (
      <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
        {state.message}
      </p>
    );
  return null;
}

export function ProfileForm({
  defaults,
  showPersonalEmail,
}: {
  defaults: {
    name: string;
    email: string;
    phone: string;
    personalEmail: string;
  };
  showPersonalEmail?: boolean;
}) {
  const [state, action, pending] = useActionState(updateProfile, initial);
  return (
    <form action={action} className="space-y-4">
      <Flash state={state} />
      <div>
        <label className="label" htmlFor="p-name">Name</label>
        <input id="p-name" name="name" className="input" defaultValue={defaults.name} required />
      </div>
      <div>
        <label className="label" htmlFor="p-email">Email</label>
        <input id="p-email" name="email" type="email" className="input" defaultValue={defaults.email} required />
      </div>
      <div>
        <label className="label" htmlFor="p-phone">Phone</label>
        <input id="p-phone" name="phone" className="input" defaultValue={defaults.phone} />
      </div>
      {showPersonalEmail && (
        <div>
          <label className="label" htmlFor="p-personal">
            Personal email{" "}
            <span className="font-normal text-navy-400">
              (where your password-reset emails are sent)
            </span>
          </label>
          <input
            id="p-personal"
            name="personalEmail"
            type="email"
            className="input"
            defaultValue={defaults.personalEmail}
          />
        </div>
      )}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, initial);
  return (
    <form action={action} className="space-y-4">
      <Flash state={state} />
      <div>
        <label className="label" htmlFor="cur">Current password</label>
        <input id="cur" name="currentPassword" type="password" className="input" required autoComplete="current-password" />
      </div>
      <div>
        <label className="label" htmlFor="np">New password</label>
        <input id="np" name="newPassword" type="password" className="input" minLength={8} required autoComplete="new-password" />
      </div>
      <div>
        <label className="label" htmlFor="cp">Confirm new password</label>
        <input id="cp" name="confirmPassword" type="password" className="input" minLength={8} required autoComplete="new-password" />
      </div>
      <button type="submit" className="btn-navy" disabled={pending}>
        {pending ? "Updating…" : "Change Password"}
      </button>
    </form>
  );
}
