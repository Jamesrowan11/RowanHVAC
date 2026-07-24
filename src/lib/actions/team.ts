"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actionRole } from "@/lib/guards";
import { saveUpload, deleteUpload, isAllowedUpload } from "@/lib/storage";
import type { ActionState } from "@/lib/actions/jobs";

/** "Meet Our Techs" on the public site, managed entirely from the admin dashboard. */

export async function addTeamMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  if (!name) return { ok: false, error: "Name is required" };

  let photoPath: string | null = null;
  let mimeType: string | null = null;
  const file = formData.get("photo");
  if (file instanceof File && file.size > 0) {
    if (file.size > 8 * 1024 * 1024) return { ok: false, error: "Photo too large (8 MB max)" };
    if (!isAllowedUpload(file.type) || file.type === "application/pdf") {
      return { ok: false, error: "Photo must be an image (JPG, PNG, WebP, HEIC)" };
    }
    photoPath = await saveUpload(Buffer.from(await file.arrayBuffer()), file.name, "team");
    mimeType = file.type;
  }

  const max = await db.teamMember.aggregate({ _max: { sortOrder: true } });
  await db.teamMember.create({
    data: {
      name,
      title: title || null,
      photoPath,
      mimeType,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateTeamMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const active = String(formData.get("active") ?? "") === "on";
  if (!name) return { ok: false, error: "Name is required" };

  const member = await db.teamMember.findUnique({ where: { id } });
  if (!member) return { ok: false, error: "Not found" };

  let photoPath = member.photoPath;
  let mimeType = member.mimeType;
  const file = formData.get("photo");
  if (file instanceof File && file.size > 0) {
    if (file.size > 8 * 1024 * 1024) return { ok: false, error: "Photo too large (8 MB max)" };
    if (!isAllowedUpload(file.type) || file.type === "application/pdf") {
      return { ok: false, error: "Photo must be an image (JPG, PNG, WebP, HEIC)" };
    }
    if (member.photoPath) await deleteUpload(member.photoPath);
    photoPath = await saveUpload(Buffer.from(await file.arrayBuffer()), file.name, "team");
    mimeType = file.type;
  }

  await db.teamMember.update({
    where: { id },
    data: { name, title: title || null, active, photoPath, mimeType },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteTeamMember(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const member = await db.teamMember.findUnique({ where: { id } });
  if (!member) return;
  await db.teamMember.delete({ where: { id } });
  if (member.photoPath) await deleteUpload(member.photoPath);
  revalidatePath("/", "layout");
}
