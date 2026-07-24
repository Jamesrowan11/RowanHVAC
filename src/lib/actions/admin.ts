"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actionRole } from "@/lib/guards";

export async function resolveUnmatched(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  await db.unmatchedInbound.updateMany({ where: { id }, data: { resolved: true } });
  revalidatePath("/portal", "layout");
}

export async function deleteUnmatched(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  await db.unmatchedInbound.deleteMany({ where: { id } });
  revalidatePath("/portal", "layout");
}
