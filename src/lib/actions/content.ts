"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actionRole } from "@/lib/guards";
import { CONTENT_FIELDS } from "@/lib/siteContent";
import type { ActionState } from "@/lib/actions/jobs";

/** Save the editable website content (hero, brand line, contact block, etc.). */
export async function updateSiteContent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");

  for (const field of CONTENT_FIELDS) {
    const value = String(formData.get(field.key) ?? "").trim().slice(0, 2000);
    const key = `content.${field.key}`;
    if (value) {
      await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    } else {
      // Empty = fall back to the built-in default.
      await db.setting.deleteMany({ where: { key } });
    }
  }

  revalidatePath("/", "layout");
  revalidatePath("/portal", "layout");
  return { ok: true };
}

/* --------------------------- Hero background photo ------------------------ */

export async function updateHeroImage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo" };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "Photo too large (10 MB max)" };
  const { isAllowedUpload, saveUpload, deleteUpload } = await import("@/lib/storage");
  if (!isAllowedUpload(file.type) || file.type === "application/pdf") {
    return { ok: false, error: "Photo must be an image (JPG, PNG, WebP, HEIC)" };
  }

  const old = await db.setting.findUnique({ where: { key: "heroImagePath" } });
  const storagePath = await saveUpload(Buffer.from(await file.arrayBuffer()), file.name, "site");

  await db.setting.upsert({
    where: { key: "heroImagePath" },
    create: { key: "heroImagePath", value: storagePath },
    update: { value: storagePath },
  });
  await db.setting.upsert({
    where: { key: "heroImageMime" },
    create: { key: "heroImageMime", value: file.type },
    update: { value: file.type },
  });
  if (old?.value) await deleteUpload(old.value);

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeHeroImage(): Promise<void> {
  await actionRole("ADMIN");
  const old = await db.setting.findUnique({ where: { key: "heroImagePath" } });
  await db.setting.deleteMany({ where: { key: { in: ["heroImagePath", "heroImageMime"] } } });
  if (old?.value) {
    const { deleteUpload } = await import("@/lib/storage");
    await deleteUpload(old.value);
  }
  revalidatePath("/", "layout");
}

/* ---------------------------- Service areas ------------------------------- */

export async function addServiceArea(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");

  const region = String(formData.get("region") ?? "").trim().slice(0, 120);
  const town = String(formData.get("town") ?? "").trim().slice(0, 120);
  const zips = String(formData.get("zips") ?? "").trim().slice(0, 500);
  if (!region) return { ok: false, error: "Region is required" };
  if (!town) return { ok: false, error: "Town is required" };

  const max = await db.serviceArea.aggregate({ _max: { sortOrder: true } });
  await db.serviceArea.create({
    data: { region, town, zips, sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateServiceArea(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");

  const id = String(formData.get("id") ?? "");
  const region = String(formData.get("region") ?? "").trim().slice(0, 120);
  const town = String(formData.get("town") ?? "").trim().slice(0, 120);
  const zips = String(formData.get("zips") ?? "").trim().slice(0, 500);
  const active = String(formData.get("active") ?? "") === "on";
  if (!region || !town) return { ok: false, error: "Region and town are required" };

  const result = await db.serviceArea.updateMany({
    where: { id },
    data: { region, town, zips, active },
  });
  if (result.count === 0) return { ok: false, error: "Not found" };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteServiceArea(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  await db.serviceArea.deleteMany({ where: { id } });
  revalidatePath("/", "layout");
}

/** One-click: copy the built-in default areas into the database to edit. */
export async function seedDefaultAreas(): Promise<void> {
  await actionRole("ADMIN");
  const count = await db.serviceArea.count();
  if (count > 0) return;
  const { DEFAULT_AREAS } = await import("@/lib/serviceArea");
  await db.serviceArea.createMany({
    data: DEFAULT_AREAS.map((a, i) => ({
      region: a.region,
      town: a.town,
      zips: a.zips.join(" "),
      sortOrder: i,
    })),
  });
  revalidatePath("/", "layout");
}
