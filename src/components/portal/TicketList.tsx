import Link from "next/link";
import { fmtDateTime } from "@/components/portal/ui";
import { fieldLabel, type TicketIssue } from "@/lib/ticket";

export type TicketRow = {
  id: string;
  invoiceNumber: string;
  status: "DRAFT" | "FINAL";
  data: unknown;
  aiCheck: unknown;
  updatedAt: Date;
  submittedAt: Date | null;
  technician?: { name: string } | null;
  job?: { id: string; customerName: string } | null;
};

type AiCheck = { issues?: TicketIssue[]; summary?: string; afterSubmit?: boolean };

const SEVERITY_STYLE: Record<string, string> = {
  error: "text-red-700",
  warning: "text-amber-700",
  suggestion: "text-navy-500",
};

/** Service tickets with their AI check, shared by the job page and the admin list. */
export function TicketList({ tickets, showJob = false }: { tickets: TicketRow[]; showJob?: boolean }) {
  return (
    <ul className="space-y-4">
      {tickets.map((t) => {
        const ai = (t.aiCheck ?? null) as AiCheck | null;
        const data = (t.data ?? {}) as Record<string, unknown>;
        const issues = ai?.issues ?? [];
        return (
          <li key={t.id} className="rounded-lg border border-navy-100 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-navy-900">
                  Ticket {t.invoiceNumber}
                  {showJob && t.job ? (
                    <>
                      {" · "}
                      <Link href={`/portal/employee/jobs/${t.job.id}`} className="text-accent hover:underline">
                        {t.job.customerName}
                      </Link>
                    </>
                  ) : null}
                </p>
                <p className="text-xs text-navy-400">
                  {t.technician?.name ?? "Former technician"} ·{" "}
                  {t.status === "FINAL"
                    ? `sent ${fmtDateTime(t.submittedAt ?? t.updatedAt)}`
                    : `draft, last saved ${fmtDateTime(t.updatedAt)}`}
                  {typeof data.total_due === "string" ? ` · total due $${data.total_due}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <a href={`/portal/tickets/${t.id}/pdf`} target="_blank" rel="noreferrer" className="btn-navy btn-sm">
                  View PDF
                </a>
                <a
                  href={`/portal/tickets/${t.id}/pdf?download`}
                  className="rounded-lg border border-navy-200 px-3 py-1.5 text-sm text-navy-700"
                >
                  Download
                </a>
              </div>
            </div>
            <div className="mt-3 text-sm">
              {!ai ? (
                <p className="text-navy-500">
                  Not checked by AI{t.status === "FINAL" ? " (sent without signal)" : " yet"}.
                </p>
              ) : (
                <>
                  <p className="text-navy-700">
                    <span className="font-medium">AI check{ai.afterSubmit ? " (after it was sent)" : ""}:</span>{" "}
                    {ai.summary || (issues.length ? "" : "No problems found.")}
                  </p>
                  {issues.length > 0 && (
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {issues.map((i, n) => (
                        <li key={n} className={SEVERITY_STYLE[i.severity] ?? ""}>
                          <span className="font-medium">{fieldLabel(i.field)}:</span> {i.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
