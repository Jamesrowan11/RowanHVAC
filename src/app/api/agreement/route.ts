import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readUpload } from "@/lib/storage";

/**
 * Serves the current service-agreement PDF. Public on purpose: customers
 * read it from the tokenized acceptance page before signing, without a
 * portal login. It contains no customer data — only the company's terms.
 */
export async function GET() {
  const setting = await db.setting.findUnique({ where: { key: "terms.agreementPdf" } });
  if (!setting?.value) return NextResponse.json({ error: "No agreement PDF" }, { status: 404 });

  try {
    const buffer = await readUpload(setting.value);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="rowan-service-agreement.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
