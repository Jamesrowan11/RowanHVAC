"use client";

/** Opens the browser print dialog — "Save as PDF" downloads the document. */
export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary print:hidden">
      Print / Save as PDF
    </button>
  );
}
