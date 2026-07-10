"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { actionRole } from "@/lib/guards";
import type { ActionState } from "@/lib/actions/jobs";

/** Admin-only price book management: labor rates, add-ons/rules, parts. */

const money = z.coerce.number().min(0, "Price can't be negative").max(1000000);

function revalidate() {
  revalidatePath("/portal/admin/pricebook");
  revalidatePath("/portal", "layout");
}

/* ------------------------------ Labor rates ------------------------------ */

export async function upsertLaborRate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");

  const zone = String(formData.get("zone") ?? "").trim().slice(0, 60);
  const minutes = Number(formData.get("minutes"));
  const price = money.safeParse(formData.get("price"));
  const twoTechRaw = String(formData.get("twoTechPrice") ?? "").trim();
  const twoTech = twoTechRaw ? money.safeParse(twoTechRaw) : null;

  if (!zone) return { ok: false, error: "Zone is required" };
  if (!Number.isInteger(minutes) || minutes <= 0) return { ok: false, error: "Minutes must be a positive whole number" };
  if (!price.success) return { ok: false, error: price.error.errors[0]?.message };
  if (twoTech && !twoTech.success) return { ok: false, error: "Invalid 2-tech price" };

  await db.laborRate.upsert({
    where: { zone_minutes: { zone, minutes } },
    create: { zone, minutes, price: price.data, twoTechPrice: twoTech?.success ? twoTech.data : null },
    update: { price: price.data, twoTechPrice: twoTech?.success ? twoTech.data : null },
  });
  revalidate();
  return { ok: true };
}

export async function deleteLaborRate(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  await db.laborRate.deleteMany({ where: { id } });
  revalidate();
}

/* --------------------------- Pricing settings ---------------------------- */

const SETTING_FIELDS = [
  { key: "pricing.ladderFee", field: "ladderFee" },
  { key: "pricing.maintenanceRate", field: "maintenanceRate" },
  { key: "pricing.twoTechMultiplier", field: "twoTechMultiplier" },
  { key: "pricing.roundToMinutes", field: "roundToMinutes" },
  { key: "pricing.minimumMinutes", field: "minimumMinutes" },
  { key: "pricing.maxMinutes", field: "maxMinutes" },
] as const;

export async function updatePricingSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");

  for (const { key, field } of SETTING_FIELDS) {
    const n = Number(formData.get(field));
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: `Invalid value for ${field}` };
    await db.setting.upsert({
      where: { key },
      create: { key, value: String(n) },
      update: { value: String(n) },
    });
  }
  revalidate();
  return { ok: true };
}

/* ------------------------------ Parts book ------------------------------- */

const partSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  partNumber: z.string().trim().max(80).optional(),
  unit: z.enum(["EACH", "PER_POUND"]),
  unitPrice: money,
});

export async function createPriceItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");
  const parsed = partSchema.safeParse({
    name: formData.get("name"),
    partNumber: formData.get("partNumber") || undefined,
    unit: formData.get("unit") || "EACH",
    unitPrice: formData.get("unitPrice"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };

  await db.priceBookItem.create({ data: { ...parsed.data, partNumber: parsed.data.partNumber ?? null } });
  revalidate();
  return { ok: true };
}

export async function updatePriceItem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const parsed = partSchema.safeParse({
    name: formData.get("name"),
    partNumber: formData.get("partNumber") || undefined,
    unit: formData.get("unit") || "EACH",
    unitPrice: formData.get("unitPrice"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };

  const result = await db.priceBookItem.updateMany({
    where: { id },
    data: { ...parsed.data, partNumber: parsed.data.partNumber ?? null },
  });
  if (result.count === 0) return { ok: false, error: "Item not found" };
  revalidate();
  return { ok: true };
}

export async function setPriceItemActive(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  await db.priceBookItem.updateMany({ where: { id }, data: { active } });
  revalidate();
}

export async function deletePriceItem(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  // Line items snapshot label/price, so deleting an item never rewrites
  // past tickets — the FK just nulls out.
  await db.priceBookItem.deleteMany({ where: { id } });
  revalidate();
}
