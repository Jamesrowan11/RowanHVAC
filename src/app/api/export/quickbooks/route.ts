import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/guards";
import type { Prisma } from "@prisma/client";

/**
 * Daily QuickBooks Desktop export of submitted, billable service tickets.
 *   GET /api/export/quickbooks?date=YYYY-MM-DD&format=iif|csv[&includeNeedsReview=1][&sample=1]
 *
 * IIF is QuickBooks Desktop's native import (invoice TRNS/SPL blocks); the
 * CSV carries the same data for tools like Transaction Pro. Tickets are
 * stamped exportedAt after a successful download (re-export is allowed —
 * the admin UI shows the stamp so double-imports are visible).
 */

const clean = (s: string | null | undefined, max = 4000) =>
  (s ?? "").replace(/[\t\r\n]+/g, " ").trim().slice(0, max);

const qbDate = (d: Date) =>
  `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? "";
  const format = url.searchParams.get("format") === "csv" ? "csv" : "iif";
  const includeNeedsReview = url.searchParams.get("includeNeedsReview") === "1";
  const sample = url.searchParams.get("sample") === "1";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Pass date=YYYY-MM-DD" }, { status: 400 });
  }
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  // No Charge is always excluded; Needs Review only on request.
  const billingIn: Prisma.ServiceTicketWhereInput["billingStatus"] = includeNeedsReview
    ? { in: ["BILLABLE", "NEEDS_REVIEW"] }
    : "BILLABLE";

  const tickets = await db.serviceTicket.findMany({
    where: { status: "SUBMITTED", serviceDate: { gte: start, lt: end }, billingStatus: billingIn },
    orderBy: { ticketNumber: "asc" },
    take: sample ? 1 : undefined,
    include: {
      client: { select: { customerNumber: true } },
      lineItems: { orderBy: { createdAt: "asc" } },
    },
  });

  if (tickets.length === 0) {
    return NextResponse.json({ error: "No matching tickets for that day" }, { status: 404 });
  }

  // Account names must match the QuickBooks company file exactly — they're
  // admin-editable settings on the export page.
  const settings = await db.setting.findMany({ where: { key: { in: ["qb.arAccount", "qb.incomeAccount"] } } });
  const AR_ACCOUNT = settings.find((s) => s.key === "qb.arAccount")?.value || "Accounts Receivable";
  const INCOME_ACCOUNT = settings.find((s) => s.key === "qb.incomeAccount")?.value || "Sales";

  let body: string;
  let contentType: string;
  let ext: string;

  if (format === "iif") {
    const lines: string[] = [
      "!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\tADDR1\tADDR2",
      "!SPL\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tMEMO",
      "!ENDTRNS",
    ];
    for (const t of tickets) {
      const total = t.total != null ? Number(t.total) : 0;
      // QuickBooks Desktop matches customers by their exact list NAME — the
      // export sends the plain name, and the service address rides along as
      // the invoice's bill-to block (ADDR1/ADDR2) to confirm identity.
      const qbName = clean(t.customerName, 100);
      const memoBits = [
        t.client?.customerNumber ? `Cust #${t.client.customerNumber}` : null,
        t.paidOnSite ? `PAID ON SITE${t.paymentNote ? ` (${clean(t.paymentNote, 60)})` : ""}` : null,
        t.billingStatus === "NEEDS_REVIEW" ? "NEEDS REVIEW — price not final" : null,
        clean(t.workPerformed, 500),
      ].filter(Boolean);
      lines.push(
        [
          "TRNS", "INVOICE", qbDate(t.serviceDate), AR_ACCOUNT,
          qbName, total.toFixed(2), String(t.ticketNumber), memoBits.join(" — "),
          qbName, clean(t.serviceAddress, 120),
        ].join("\t")
      );
      const itemLines = t.lineItems.length > 0 ? t.lineItems : null;
      if (itemLines) {
        for (const li of itemLines) {
          lines.push(
            ["SPL", "INVOICE", qbDate(t.serviceDate), INCOME_ACCOUNT, (-Number(li.amount)).toFixed(2), clean(li.label, 200)].join("\t")
          );
        }
        // Any admin adjustment beyond the line items lands on its own line so
        // the invoice always balances.
        const itemSum = itemLines.reduce((s, li) => s + Number(li.amount), 0);
        const diff = Math.round((total - itemSum) * 100) / 100;
        if (Math.abs(diff) >= 0.01) {
          lines.push(["SPL", "INVOICE", qbDate(t.serviceDate), INCOME_ACCOUNT, (-diff).toFixed(2), "Adjustment"].join("\t"));
        }
      } else {
        lines.push(["SPL", "INVOICE", qbDate(t.serviceDate), INCOME_ACCOUNT, (-total).toFixed(2), "Service"].join("\t"));
      }
      lines.push("ENDTRNS");
    }
    body = lines.join("\r\n") + "\r\n";
    contentType = "application/octet-stream";
    ext = "iif";
  } else {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [
      ["TicketNumber", "ServiceDate", "CustomerName", "CustomerNumber", "ServiceAddress", "PaidOnSite", "Memo", "LineLabel", "LineAmount", "TicketTotal"].join(","),
    ];
    for (const t of tickets) {
      const total = t.total != null ? Number(t.total).toFixed(2) : "";
      const memo = clean(t.workPerformed, 1000);
      const base = [
        t.ticketNumber, qbDate(t.serviceDate), esc(clean(t.customerName, 100)),
        t.client?.customerNumber ?? "", esc(clean(t.serviceAddress, 150)), t.paidOnSite ? "YES" : "", esc(memo),
      ];
      if (t.lineItems.length === 0) {
        rows.push([...base, esc("Service"), total, total].join(","));
      } else {
        for (const li of t.lineItems) {
          rows.push([...base, esc(clean(li.label, 200)), Number(li.amount).toFixed(2), total].join(","));
        }
      }
    }
    body = rows.join("\r\n") + "\r\n";
    contentType = "text/csv; charset=utf-8";
    ext = "csv";
  }

  // Stamp AFTER building the file — a failed build never marks anything.
  await db.serviceTicket.updateMany({
    where: { id: { in: tickets.map((t) => t.id) } },
    data: { exportedAt: new Date() },
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="rowan-tickets-${date}${sample ? "-sample" : ""}.${ext}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
