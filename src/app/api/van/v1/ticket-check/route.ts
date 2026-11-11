import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { ticketDataSchema } from "@/lib/ticket";
import { checkTicketWithAi, TicketAiUnavailable } from "@/lib/ticketAi";
import { authenticateDevice, storeAiCheck } from "@/lib/vanServer";
import { ticketIssueSchema, VAN_ID } from "@/lib/vanSync";

// Claude can take a while to read a long ticket.
export const maxDuration = 120;

const bodySchema = z.object({
  ticketId: z.string().regex(VAN_ID).nullable().optional(),
  jobId: z.string().min(1).max(64),
  data: ticketDataSchema,
  localIssues: z.array(ticketIssueSchema).max(60).default([]),
});

/**
 * "Check with AI" on the van's service ticket screen. Returns issues tied to
 * fields on the sheet; the van outlines them and lists them for the tech.
 */
export async function POST(req: Request) {
  const caller = await authenticateDevice(req.headers.get("authorization"));
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "This van is signed out. Please sign in again." },
      { status: 401 },
    );
  }
  if (!rateLimit(`van-ticket-ai:${caller.user.id}`, 30, 60 * 60 * 1000).ok) {
    return NextResponse.json(
      { ok: false, error: "Too many AI checks this hour. Try again later." },
      { status: 429 },
    );
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid ticket." }, { status: 422 });
  }
  const { ticketId, jobId, data, localIssues } = parsed.data;
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { technicianId: true, serviceNeeded: true },
  });
  if (!job || job.technicianId !== caller.user.id) {
    return NextResponse.json(
      { ok: false, error: "This job is no longer assigned to you." },
      { status: 403 },
    );
  }

  try {
    const result = await checkTicketWithAi(data, {
      serviceNeeded: job.serviceNeeded,
      alreadyFound: localIssues,
    });
    if (ticketId) await storeAiCheck(ticketId, caller.user.id, result);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof TicketAiUnavailable) {
      // 409 (not 5xx): the van shows this message instead of "no signal".
      return NextResponse.json({ ok: false, error: e.message }, { status: 409 });
    }
    console.error("[ticket ai]", e);
    return NextResponse.json(
      { ok: false, error: "The AI check is not working right now. The app's own checks still ran." },
      { status: 502 },
    );
  }
}
