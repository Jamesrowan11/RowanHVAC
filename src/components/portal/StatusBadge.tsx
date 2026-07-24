import type { JobStatus, PaymentStatus, RequestStatus } from "@prisma/client";

const jobStyles: Record<JobStatus, string> = {
  SCHEDULED: "bg-navy-100 text-navy-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-700",
};

const jobLabels: Record<JobStatus, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <span className={`badge ${jobStyles[status]}`}>{jobLabels[status]}</span>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <span className={`badge ${status === "PAID" ? "bg-green-100 text-green-800" : "bg-navy-100 text-navy-800"}`}>
      {status === "PAID" ? "Paid" : "Sent"}
    </span>
  );
}

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const styles: Record<RequestStatus, [string, string]> = {
    NEW: ["bg-accent-100 text-accent-800", "New"],
    CONVERTED: ["bg-green-100 text-green-800", "Scheduled"],
    CLOSED: ["bg-gray-100 text-gray-600", "Closed"],
  };
  const [cls, label] = styles[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
