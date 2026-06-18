/**
 * Minimal service worker — makes the site an installable PWA on Android.
 * Network-first for navigations (so portal data is always fresh), with a
 * tiny offline fallback page. We deliberately do NOT cache API/portal data.
 */
const CACHE = "rowanhvac-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, "/icon-192.png"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  // Only handle page navigations; let everything else hit the network normally.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match(OFFLINE_URL))
    );
  }
});
