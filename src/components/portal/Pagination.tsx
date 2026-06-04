import Link from "next/link";

/** Parse a 1-based page number from a raw searchParams value. */
export function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export const PAGE_SIZE = 10;

export function Pagination({
  page,
  total,
  pageSize = PAGE_SIZE,
  basePath,
  extraParams,
}: {
  page: number;
  total: number;
  pageSize?: number;
  basePath: string;
  extraParams?: Record<string, string>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const href = (p: number) => {
    const params = new URLSearchParams(extraParams);
    params.set("page", String(p));
    return `${basePath}?${params.toString()}`;
  };

  return (
    <nav
      className="mt-6 flex items-center justify-between gap-2"
      aria-label="Pagination"
    >
      {page > 1 ? (
        <Link href={href(page - 1)} className="btn-outline btn-sm">
          ← Previous
        </Link>
      ) : (
        <span className="btn-outline btn-sm pointer-events-none opacity-40">
          ← Previous
        </span>
      )}

      <span className="text-sm text-navy-500">
        Page {page} of {totalPages}
      </span>

      {page < totalPages ? (
        <Link href={href(page + 1)} className="btn-outline btn-sm">
          Next →
        </Link>
      ) : (
        <span className="btn-outline btn-sm pointer-events-none opacity-40">
          Next →
        </span>
      )}
    </nav>
  );
}
