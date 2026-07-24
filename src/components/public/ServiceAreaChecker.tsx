"use client";

import { useState } from "react";
import { checkServiceArea, type AreaData, type AreaCheckResult } from "@/lib/serviceArea";
import { COMPANY } from "@/lib/constants";

export default function ServiceAreaChecker({ data, phone }: { data: AreaData; phone: string }) {
  const [result, setResult] = useState<AreaCheckResult | null>(null);
  const phoneHref = `tel:${phone.replace(/[^\d+]/g, "")}`;

  return (
    <div className="mx-auto mt-10 max-w-xl">
      <div className="card text-left">
        <h3 className="font-bold text-navy">Are you in our service area?</h3>
        <p className="mt-1 text-sm text-gray-600">
          Type your address (or just your town and ZIP code) and we&apos;ll check.
        </p>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setResult(checkServiceArea(String(fd.get("address") ?? ""), data));
          }}
        >
          <label htmlFor="area-address" className="sr-only">Your address</label>
          <input
            id="area-address"
            name="address"
            placeholder="123 Main St, Columbia, MD 21044"
            className="input flex-1"
            onChange={() => setResult(null)}
          />
          <button type="submit" className="btn-primary shrink-0">Check my address</button>
        </form>

        {result === "covered" && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800" role="status">
            <p className="font-semibold">Good news — you&apos;re in our service area! 🎉</p>
            <p className="mt-1">
              <a href="#contact" className="font-medium underline">Request a quote</a> or call us at{" "}
              <a href={phoneHref} className="font-medium underline">{phone}</a>.
            </p>
          </div>
        )}
        {result === "outside" && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
            <p className="font-semibold">You look to be a bit outside our usual area.</p>
            <p className="mt-1">
              We do serve some surrounding areas, so it&apos;s worth a call:{" "}
              <a href={phoneHref} className="font-medium underline">{phone}</a>.
            </p>
          </div>
        )}
        {result === "unknown" && (
          <div className="mt-4 rounded-lg border border-navy-100 bg-navy-50 p-4 text-sm text-gray-700" role="status">
            <p className="font-semibold">We couldn&apos;t quite place that address.</p>
            <p className="mt-1">
              Try adding your town or ZIP code — or just call us at{" "}
              <a href={phoneHref} className="font-medium underline">{phone}</a>{" "}
              and we&apos;ll check for you.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
