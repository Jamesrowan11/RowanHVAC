"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actionRole } from "@/lib/guards";
import { notify } from "@/lib/email";
import type { ActionState } from "@/lib/actions/jobs";

export async function createAnnouncement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await actionRole("ADMIN");

  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const body = String(formData.get("body") ?? "").trim().slice(0, 10000);
  if (!title) return { ok: false, error: "Title is required" };
  if (!body) return { ok: false, error: "Body is required" };

  await db.announcement.create({ data: { title, body, authorId: admin.id } });

  // Automation: let the team know right away.
  const staff = await db.user.findMany({
    where: { role: { in: ["EMPLOYEE", "ADMIN"] }, active: true, NOT: { id: admin.id } },
    select: { email: true },
  });
  if (staff.length > 0) {
    notify({
      senderUserId: admin.id,
      to: staff.map((s) => s.email),
      subject: `Company announcement: ${title}`,
      body: `${body}\n\nPosted by ${admin.name}. See all announcements in the portal: ${process.env.APP_URL || ""}/portal/employee/announcements`,
    });
  }

  revalidatePath("/portal", "layout");
  return { ok: true };
}

export async function deleteAnnouncement(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  await db.announcement.deleteMany({ where: { id } });
  revalidatePath("/portal", "layout");
}
