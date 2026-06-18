"use client";

import { useEffect } from "react";

/** Registers the PWA service worker so the site is installable on Android. */
export default function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
