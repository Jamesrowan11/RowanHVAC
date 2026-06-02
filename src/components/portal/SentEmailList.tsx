import { fmtDateTime } from "@/components/portal/ui";

type Item = {
  id: string;
  to: string;
  subject: string;
  body: string;
  status: string;
  createdAt: Date;
  sender?: { name: string } | null;
};

const STATUS_STYLES: Record<string, string> = {
  SENT: "bg-green-100 text-green-800",
  LOGGED: "bg-blue-100 text-blue-800",
  FAILED: "bg-red-100 text-red-700",
};

export function SentEmailList({
  emails,
  showSender = true,
}: {
  emails: Item[];
  showSender?: boolean;
}) {
  if (emails.length === 0) {
    return <p className="text-sm text-navy-500">No emails sent yet.</p>;
  }
  return (
    <div className="space-y-2">
      {emails.map((e) => (
        <details key={e.id} className="card p-4">
          <summary className="cursor-pointer">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-navy-900">{e.subject}</span>
              <span className={`badge ${STATUS_STYLES[e.status] ?? "bg-navy-100 text-navy-600"}`}>
                {e.status}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-navy-500">
              To: {e.to} · {fmtDateTime(e.createdAt)}
              {showSender ? ` · by ${e.sender?.name ?? "System"}` : ""}
            </p>
          </summary>
          <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-navy-50 p-3 text-sm text-navy-700">
            {e.body}
          </pre>
        </details>
      ))}
    </div>
  );
}
