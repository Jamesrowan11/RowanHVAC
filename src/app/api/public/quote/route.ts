import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIpFromHeaders } from "@/lib/rateLimit";

/**
 * Public quote endpoint for the statically-hosted marketing site
 * (rowanhvac.rowancopy.com), which lives on a different subdomain than this
 * portal (rowanhvacportal.rowancopy.com). The static form POSTs JSON here, so
 * we enable CORS for the configured public origin.
 *
 * Set PUBLIC_SITE_ORIGIN in the portal's environment, e.g.
 *   PUBLIC_SITE_ORIGIN=https://rowanhvac.rowancopy.com
 */

const schema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().min(7).max(40),
  email: z.string().email().max(160),
  serviceNeeded: z.string().min(1).max(120),
  message: z.string().max(4000).optional(),
});

function allowedOrigin(reqOrigin: string | null): string {
  const configured = process.env.PUBLIC_SITE_ORIGIN;
  if (configured) return configured;
  // Fall back to echoing the request origin in development.
  return reqOrigin || "*";
}

function corsHeaders(reqOrigin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(reqOrigin),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  // Throttle abuse: 5 submissions / 10 min per IP.
  const ip = clientIpFromHeaders(req.headers);
  if (!rateLimit(`public-quote:${ip}`, 5, 10 * 60 * 1000).ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again shortly or call 410-531-0008." },
      { status: 429, headers },
    );
  }

  let data: unknown;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request." },
      { status: 400, headers },
    );
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Please complete all required fields with valid values." },
      { status: 422, headers },
    );
  }

  const v = parsed.data;
  await prisma.request.create({
    data: {
      type: "QUOTE",
      status: "NEW",
      name: v.name.trim(),
      phone: v.phone.trim(),
      email: v.email.toLowerCase().trim(),
      serviceNeeded: v.serviceNeeded,
      message: v.message?.trim() || null,
    },
  });

  return NextResponse.json({ ok: true }, { status: 200, headers });
}
