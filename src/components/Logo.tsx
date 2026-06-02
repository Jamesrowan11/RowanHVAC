import Link from "next/link";

export function Logo({
  href = "/",
  light = false,
}: {
  href?: string;
  light?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2.5"
      aria-label="Rowan Heating & Air Conditioning home"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-900 shadow-sm"
        aria-hidden="true"
      >
        <svg viewBox="0 0 64 64" className="h-6 w-6">
          <path
            d="M20 46V18h13c6 0 10 3.5 10 9 0 4-2.2 6.9-5.8 8.2L45 46h-7.6l-6.7-9.7H27V46h-7zm7-15.4h5.4c2.6 0 4.2-1.3 4.2-3.4S39 23.8 32.4 23.8H27v6.8z"
            fill="#f57c1f"
          />
        </svg>
      </span>
      <span className="flex flex-col leading-tight">
        <span
          className={`text-[15px] font-extrabold tracking-tight ${
            light ? "text-white" : "text-navy-900"
          }`}
        >
          Rowan Heating &amp; Air
        </span>
        <span
          className={`text-[10px] font-medium uppercase tracking-[0.14em] ${
            light ? "text-navy-100" : "text-navy-400"
          }`}
        >
          Conditioning · Since 1958
        </span>
      </span>
    </Link>
  );
}
