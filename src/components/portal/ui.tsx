import type { JobStatus } from "@prisma/client";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy-900">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-navy-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const JOB_STATUS_STYLES: Record<JobStatus, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-navy-100 text-navy-500",
};

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`badge ${JOB_STATUS_STYLES[status]}`}>
      {JOB_STATUS_LABELS[status]}
    </span>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-navy-500">
      {children}
    </div>
  );
}

export function FlashFromSearchParams({
  message,
  error,
}: {
  message?: string;
  error?: string;
}) {
  if (!message && !error) return null;
  return (
    <div
      className={`mb-4 rounded-lg px-3 py-2 text-sm ${
        error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
      }`}
      role="status"
    >
      {error || message}
    </div>
  );
}

export function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
