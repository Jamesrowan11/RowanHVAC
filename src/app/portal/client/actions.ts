"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertRole } from "@/lib/session";

const requestSchema = z.object({
  serviceNeeded: z.string().min(1).max(160),
  message: z.string().max(4000).optional(),
});

export type ClientRequestState = { ok: boolean; error?: string };

export async function submitClientRequest(
  _prev: ClientRequestState,
  formData: FormData,
): Promise<ClientRequestState> {
  const user = await assertRole("CLIENT");
  const parsed = requestSchema.safeParse({
    serviceNeeded: formData.get("serviceNeeded"),
    message: formData.get("message") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Please choose a service and try again." };
  }

  const full = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true, email: true, phone: true },
  });

  await prisma.request.create({
    data: {
      type: "SERVICE",
      status: "NEW",
      clientId: user.id,
      name: full?.name ?? user.name,
      email: full?.email ?? user.email,
      phone: full?.phone ?? "",
      serviceNeeded: parsed.data.serviceNeeded,
      message: parsed.data.message?.trim() || null,
    },
  });

  revalidatePath("/portal/client");
  revalidatePath("/portal/client/request");
  return { ok: true };
}

/**
 * Schedule-maintenance request. Only allowed for clients with an ACTIVE policy.
 * The check is enforced server-side, not just in the UI.
 */
export async function scheduleMaintenance() {
  const user = await assertRole("CLIENT");
  const policy = await prisma.maintenancePolicy.findUnique({
    where: { clientId: user.id },
  });
  if (!policy || !policy.active) {
    throw new Error("An active maintenance policy is required");
  }

  const full = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true, email: true, phone: true },
  });

  await prisma.request.create({
    data: {
      type: "MAINTENANCE",
      status: "NEW",
      clientId: user.id,
      name: full?.name ?? user.name,
      email: full?.email ?? user.email,
      phone: full?.phone ?? "",
      serviceNeeded: "Scheduled Maintenance (policy)",
      message: "Maintenance visit requested via active service agreement.",
    },
  });

  revalidatePath("/portal/client/maintenance");
  revalidatePath("/portal/client");
}
