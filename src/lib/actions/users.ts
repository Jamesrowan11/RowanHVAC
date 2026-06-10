"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { actionRole } from "@/lib/guards";
import { notify } from "@/lib/email";
import { COMPANY } from "@/lib/constants";
import type { ActionState } from "@/lib/actions/jobs";

const userSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Valid email is required").max(200),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  role: z.enum(["CLIENT", "EMPLOYEE", "ADMIN"]),
});

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(100);

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");

  const parsed = userSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    address: formData.get("address") || undefined,
    role: formData.get("role"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };

  const pw = passwordSchema.safeParse(formData.get("password"));
  if (!pw.success) return { ok: false, error: pw.error.errors[0]?.message };

  const existing = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { ok: false, error: "A user with that email already exists" };

  const user = await db.user.create({
    data: {
      ...parsed.data,
      passwordHash: await hash(pw.data, 12),
    },
  });

  // Automation: welcome email (no password included — admin shares it directly).
  notify({
    to: [user.email],
    subject: `Your ${COMPANY.shortName} portal account`,
    body: `Hi ${user.name},\n\nAn account has been created for you on the ${COMPANY.name} portal.\n\nSign in with this email address at: ${process.env.APP_URL || ""}/login\n\nIf you don't have your password yet, contact us at ${COMPANY.phone}.`,
  });

  revalidatePath("/portal", "layout");
  return { ok: true };
}

export async function updateUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");

  const parsed = userSchema.omit({ role: true }).safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    address: formData.get("address") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message };

  const taken = await db.user.findFirst({ where: { email: parsed.data.email, NOT: { id } } });
  if (taken) return { ok: false, error: "That email is already in use" };

  const result = await db.user.updateMany({ where: { id }, data: parsed.data });
  if (result.count === 0) return { ok: false, error: "User not found" };

  revalidatePath("/portal", "layout");
  return { ok: true };
}

export async function setUserPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");

  const pw = passwordSchema.safeParse(formData.get("password"));
  if (!pw.success) return { ok: false, error: pw.error.errors[0]?.message };

  const result = await db.user.updateMany({
    where: { id },
    data: { passwordHash: await hash(pw.data, 12) },
  });
  if (result.count === 0) return { ok: false, error: "User not found" };

  revalidatePath("/portal", "layout");
  return { ok: true };
}

export async function setUserActive(formData: FormData): Promise<void> {
  const admin = await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  // Don't let an admin lock themselves out.
  if (id === admin.id && !active) throw new Error("You can't deactivate your own account");

  await db.user.updateMany({ where: { id }, data: { active } });
  revalidatePath("/portal", "layout");
}

export async function deleteUser(formData: FormData): Promise<void> {
  const admin = await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  if (id === admin.id) throw new Error("You can't delete your own account");

  // Jobs reference users with required relations; deactivation is preferred.
  const jobCount = await db.job.count({
    where: { OR: [{ technicianId: id }, { clientId: id }] },
  });
  if (jobCount > 0) {
    throw new Error("This user has job history — deactivate instead of deleting");
  }

  await db.user.deleteMany({ where: { id } });
  revalidatePath("/portal", "layout");
}

export async function setMaintenancePolicy(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("policyActive") ?? "") === "true";
  const renewalRaw = String(formData.get("policyRenewal") ?? "");
  const renewal = renewalRaw ? new Date(renewalRaw) : null;

  await db.user.updateMany({
    where: { id, role: "CLIENT" },
    data: { policyActive: active, policyRenewal: active ? renewal : null },
  });
  revalidatePath("/portal", "layout");
}
