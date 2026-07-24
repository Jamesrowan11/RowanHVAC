"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Prompts the user to turn on push notifications and registers this device's
 * subscription. Renders nothing if push isn't supported, isn't configured on
 * the server, or is already enabled/blocked.
 */
export default function NotificationsSetup() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      return;
    }
    // Only prompt when permission hasn't been decided yet.
    if (Notification.permission === "default") setShow(true);
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const res = await fetch("/api/push/subscribe");
      const { publicKey } = await res.json();
      if (!publicKey) {
        setShow(false);
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setShow(false);
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      setShow(false);
    } catch {
      // Swallow — notifications are a nice-to-have, never block the portal.
      setShow(false);
    } finally {
      setBusy(false);
    }
  }

  if (!show) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent-200 bg-accent-50 p-4">
      <div className="text-sm text-gray-700">
        <p className="font-semibold text-navy">Turn on notifications</p>
        <p className="mt-0.5">Get alerts on this device for new messages and account updates.</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setShow(false)} className="btn-small-outline">Not now</button>
        <button onClick={enable} disabled={busy} className="btn-small">
          {busy ? "Enabling…" : "Enable"}
        </button>
      </div>
    </div>
  );
}
