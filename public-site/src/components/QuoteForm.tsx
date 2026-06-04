"use client";

import { useState } from "react";
import { SERVICE_OPTIONS } from "@/lib/company";
import { QUOTE_API_URL } from "@/lib/links";

type Status = "idle" | "submitting" | "ok" | "error";

export function QuoteForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch(QUOTE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        setStatus("ok");
        form.reset();
      } else {
        setStatus("error");
        setError(json.error || "Something went wrong. Please call us at 410-531-0008.");
      }
    } catch {
      setStatus("error");
      setError(
        "We couldn't reach our server. Please try again, or call us at 410-531-0008.",
      );
    }
  }

  if (status === "ok") {
    return (
      <div
        className="rounded-xl border border-green-200 bg-green-50 p-6 text-center"
        role="status"
      >
        <h3 className="text-lg font-semibold text-green-800">
          Thank you — we&apos;ve received your request.
        </h3>
        <p className="mt-2 text-sm text-green-700">
          A member of the Rowan family will reach out to you soon. For urgent
          needs, please call us at{" "}
          <a className="font-semibold underline" href="tel:+14105310008">
            410-531-0008
          </a>
          .
        </p>
      </div>
    );
  }

  const pending = status === "submitting";

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="q-name">Name</label>
          <input id="q-name" name="name" className="input" autoComplete="name" required />
        </div>
        <div>
          <label className="label" htmlFor="q-phone">Phone</label>
          <input
            id="q-phone"
            name="phone"
            className="input"
            autoComplete="tel"
            inputMode="tel"
            required
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="q-email">Email</label>
        <input id="q-email" name="email" type="email" className="input" autoComplete="email" required />
      </div>

      <div>
        <label className="label" htmlFor="q-service">Service needed</label>
        <select id="q-service" name="serviceNeeded" className="input" defaultValue="" required>
          <option value="" disabled>Choose a service…</option>
          {SERVICE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="q-message">
          Message <span className="font-normal text-navy-400">(optional)</span>
        </label>
        <textarea
          id="q-message"
          name="message"
          rows={4}
          className="input"
          placeholder="Tell us a bit about what's going on…"
        />
      </div>

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Sending…" : "Request a Quote"}
      </button>
    </form>
  );
}
