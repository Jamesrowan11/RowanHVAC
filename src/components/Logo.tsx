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
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent font-bold text-white shadow-sm"
        aria-hidden="true"
      >
        R
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
