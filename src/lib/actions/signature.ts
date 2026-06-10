"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actionRole } from "@/lib/guards";
import type { ActionState } from "@/lib/actions/jobs";

export async function updateSignature(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");

  const value = String(formData.get("signature") ?? "").trim().slice(0, 2000);
  if (!value) return { ok: false, error: "Signature can't be empty" };

  await db.setting.upsert({
    where: { key: "emailSignature" },
    create: { key: "emailSignature", value },
    update: { value },
  });

  revalidatePath("/portal", "layout");
  return { ok: true };
}
