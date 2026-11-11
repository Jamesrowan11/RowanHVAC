import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { ticketLayout, withTotals, parseMoney, type LayoutElement, type TicketData } from "@/lib/ticket";

/**
 * The customer's copy of a service ticket, drawn from the same layout the van
 * shows while the technician fills it in (ticket_layout.json, origin top-left,
 * points). Writing longer than its box (usually the work description) is
 * finished on a second page so nothing is cut off.
 */

const INK = rgb(0.043, 0.239, 0.569); // the "pen" colour, as on the van preview

function hex(color: string | null | undefined) {
  const m = /^#?([0-9a-f]{6})$/i.exec(color ?? "");
  if (!m) return rgb(0, 0, 0);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** pdf-lib's standard fonts are WinAnsi only: swap or drop anything else. */
export function winAnsi(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\t/g, " ")
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g, "");
}

export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(" ")) {
      const trial = line ? `${line} ${word}` : word;
      if (!line || font.widthOfTextAtSize(trial, size) <= width) {
        line = trial;
      } else {
        lines.push(line);
        line = word;
      }
      // A single "word" wider than the box (a long serial number): break it.
      while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

function money(v: string): string {
  const n = parseMoney(v);
  if (n === null || v.trim() === "") return v;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function renderTicketPdf(raw: TicketData, opts: { title?: string } = {}): Promise<Uint8Array> {
  const data = withTotals(raw);
  const doc = await PDFDocument.create();
  doc.setTitle(opts.title ?? `Service Ticket ${String(data.invoice_no ?? "")}`.trim());
  doc.setAuthor("Rowan Heating & Air Conditioning, Inc.");
  doc.setCreator("Rowan HVAC van terminal");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { w: W, h: H } = ticketLayout.page;
  const page = doc.addPage([W, H]);
  const Y = (y: number) => H - y;
  const overflow: { label: string; text: string }[] = [];

  const drawString = (p: PDFPage, s: string, x: number, top: number, size: number, font: PDFFont, color = rgb(0, 0, 0)) =>
    // Layout y is the top of the text; pdf-lib draws from the baseline.
    p.drawText(s, { x, y: Y(top) - size * 0.8, size, font, color });

  for (const e of ticketLayout.elements as LayoutElement[]) {
    if (e.t === "rect") {
      page.drawRectangle({
        x: e.x,
        y: Y(e.y + e.h),
        width: e.w,
        height: e.h,
        color: e.fill ? hex(e.fill) : undefined,
        borderColor: e.lw ? rgb(0, 0, 0) : undefined,
        borderWidth: e.lw || 0,
      });
    } else if (e.t === "line") {
      page.drawLine({ start: { x: e.x1, y: Y(e.y1) }, end: { x: e.x2, y: Y(e.y2) }, thickness: e.lw ?? 0.5 });
    } else if (e.t === "text") {
      const font = e.bold ? bold : regular;
      const color = hex(e.color ?? "#000000");
      const s = winAnsi(e.s);
      if (e.w) {
        wrapText(s, font, e.size, e.w).forEach((line, i) =>
          drawString(page, line, e.x, e.y + i * e.size * 1.15, e.size, font, color),
        );
      } else {
        const width = font.widthOfTextAtSize(s, e.size);
        const x = e.align === "center" ? e.x - width / 2 : e.align === "right" ? e.x - width : e.x;
        drawString(page, s, x, e.y, e.size, font, color);
      }
    } else if (e.t === "field") {
      const value = data[e.id];
      if (e.kind === "check") {
        if (value === true) {
          page.drawLine({ start: { x: e.x + 1, y: Y(e.y + 3.5) }, end: { x: e.x + 3, y: Y(e.y + 6) }, thickness: 1.2, color: INK });
          page.drawLine({ start: { x: e.x + 3, y: Y(e.y + 6) }, end: { x: e.x + 7.5, y: Y(e.y - 0.5) }, thickness: 1.2, color: INK });
        }
        continue;
      }
      if (typeof value !== "string" || !value.trim()) continue;
      const size = e.size ?? 7.5;
      let s = winAnsi(e.kind === "money" ? money(value) : value.trim());
      if (e.kind === "multi") {
        const lh = e.lh ?? size * 1.3;
        const lines = wrapText(s, regular, size, e.w - 2);
        const fit = Math.max(1, Math.floor((e.h + 2) / lh));
        lines.slice(0, fit).forEach((line, i) => drawString(page, line, e.x + 1, e.y + 2 + i * lh, size, regular, INK));
        if (lines.length > fit) {
          overflow.push({ label: e.id, text: lines.slice(fit).join(" ") });
          drawString(page, "(continued on page 2)", e.x + e.w - regular.widthOfTextAtSize("(continued on page 2)", 5.5) - 1, e.y + e.h - 6, 5.5, regular, rgb(0.7, 0.15, 0.12));
        }
        continue;
      }
      // One line: shrink to fit rather than run into the next box.
      let fsize = size;
      while (fsize > 4.5 && regular.widthOfTextAtSize(s, fsize) > e.w - 2) fsize -= 0.25;
      while (s.length > 1 && regular.widthOfTextAtSize(s, fsize) > e.w - 2) s = s.slice(0, -1);
      const width = regular.widthOfTextAtSize(s, fsize);
      const align = e.kind === "money" ? "right" : e.align ?? "left";
      const x = align === "right" ? e.x + e.w - 1 - width : align === "center" ? e.x + (e.w - width) / 2 : e.x + 1;
      drawString(page, s, x, e.y + (e.h - fsize) / 2 + 0.5, fsize, regular, INK);
    }
  }

  if (overflow.length) {
    const p2 = doc.addPage([W, H]);
    let top = 40;
    drawString(p2, `Service Ticket ${winAnsi(String(data.invoice_no ?? ""))} - continued`, 40, top, 12, bold);
    top += 24;
    const labels: Record<string, string> = Object.fromEntries(
      ticketLayout.sections.flatMap((s) => s.fields.map((f) => [f.id, f.label])),
    );
    for (const o of overflow) {
      drawString(p2, winAnsi(labels[o.label] ?? o.label).toUpperCase() + " (continued)", 40, top, 9, bold);
      top += 14;
      for (const line of wrapText(winAnsi(o.text), regular, 10, W - 80)) {
        if (top > H - 40) break;
        drawString(p2, line, 40, top, 10, regular, INK);
        top += 13;
      }
      top += 10;
    }
  }
  return doc.save();
}
