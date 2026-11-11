import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { openFileStream } from "@/lib/uploads";

/** Equipment manuals: a library of PDFs (or scans) per unit brand + model. */

export const MANUAL_EQUIPMENT_TYPES = [
  "Air Conditioner",
  "Heat Pump",
  "Furnace",
  "Air Handler",
  "Ductless Mini-Split",
  "Boiler",
  "Water Heater",
  "Thermostat / Controls",
  "Air Quality / Humidifier",
  "Other",
] as const;

// Manuals are often big scans; larger than the 10 MB limit for client documents.
export const MAX_MANUAL_BYTES = 50 * 1024 * 1024;

export const MANUAL_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

export const manualSchema = z.object({
  brand: z.string().trim().min(1, "Enter the brand").max(120),
  model: z.string().trim().min(1, "Enter the model number").max(160),
  equipmentType: z.enum(MANUAL_EQUIPMENT_TYPES),
  title: z.string().trim().max(255).optional(),
});

/** Matches every word of the search against brand, model, type, or title. */
export function manualSearchWhere(q: string | undefined): Prisma.ManualWhereInput {
  const words = (q || "").trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (words.length === 0) return {};
  return {
    AND: words.map((w) => ({
      OR: [
        { brand: { contains: w } },
        { model: { contains: w } },
        { equipmentType: { contains: w } },
        { title: { contains: w } },
      ],
    })),
  };
}

export function manualDownloadName(m: { brand: string; model: string; title: string | null; originalName: string }) {
  const ext = (m.originalName.match(/\.[A-Za-z0-9]{1,8}$/) || [""])[0];
  const base = [m.brand, m.model, m.title].filter(Boolean).join(" - ");
  return (base.replace(/[^\w .()-]+/g, "_").slice(0, 150) || "manual") + ext;
}

/** Streams a manual's file. `inline` opens it in the browser's PDF viewer. */
export async function manualFileResponse(
  m: { storedName: string; mimeType: string; brand: string; model: string; title: string | null; originalName: string },
  inline: boolean,
): Promise<Response> {
  try {
    const { stream, size } = await openFileStream(m.storedName);
    return new Response(stream, {
      headers: {
        "Content-Type": m.mimeType || "application/octet-stream",
        "Content-Length": String(size),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${manualDownloadName(m)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "File unavailable" }, { status: 404 });
  }
}
