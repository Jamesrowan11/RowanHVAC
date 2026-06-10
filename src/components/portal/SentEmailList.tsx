import { fmtDateTime } from "@/lib/queries";
import type { EmailLog } from "@prisma/client";

type LogWithSender = EmailLog & { sender: { name: string } | null };

const statusStyles: Record<string, string> = {
  SENT: "bg-green-100 text-green-800",
  LOGGED: "bg-navy-100 text-navy-800",
  FAILED: "bg-red-100 text-red-700",
};

export default function SentEmailList({ logs, showSender }: { logs: LogWithSender[]; showSender: boolean }) {
  return (
    <ul className="space-y-3">
      {logs.length === 0 && <li className="text-sm text-gray-500">No emails yet.</li>}
      {logs.map((log) => (
        <li key={log.id} className="rounded-lg bg-navy-50 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-navy">{log.subject}</p>
            <span className={`badge ${statusStyles[log.status] ?? ""}`}>
              {log.status === "LOGGED" ? "Logged (console mode)" : log.status === "SENT" ? "Sent" : "Failed"}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {showSender && <>From: {log.sender?.name ?? "System automation"} · </>}
            To: {log.toAddresses} · {fmtDateTime(log.createdAt)}
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-medium text-accent-600">Show body</summary>
            <pre className="mt-2 whitespace-pre-wrap rounded bg-white p-3 font-sans text-xs text-gray-700">{log.body}</pre>
          </details>
          {log.error && <p className="mt-1 text-xs text-red-600">Error: {log.error}</p>}
        </li>
      ))}
    </ul>
  );
}
