"use client";

import { useEffect } from "react";

/**
 * First-party, privacy-friendly analytics for the public site. Records a page
 * view on load and clicks on any element marked with data-track="call" or
 * data-track="quote". Uses sendBeacon so events aren't lost when a tel: link
 * or in-page jump navigates away.
 */
const GTAG_EVENTS: Record<string, string> = {
  CALL_CLICK: "call_click",
  QUOTE_CLICK: "quote_click",
};

function send(type: string) {
  try {
    const body = JSON.stringify({ type });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/track", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
    }
    // Mirror CTA clicks to the Google tag (Ads conversions), when installed.
    const g = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    if (g && GTAG_EVENTS[type]) g("event", GTAG_EVENTS[type]);
  } catch {
    /* analytics must never break the page */
  }
}

export default function AnalyticsTracker() {
  useEffect(() => {
    // Count one page view per tab load (avoids React strict-mode double-fire).
    if (!sessionStorage.getItem("rhv_pv")) {
      sessionStorage.setItem("rhv_pv", "1");
      send("PAGE_VIEW");
    }

    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.("[data-track]");
      const kind = el?.getAttribute("data-track");
      if (kind === "call") send("CALL_CLICK");
      else if (kind === "quote") send("QUOTE_CLICK");
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
