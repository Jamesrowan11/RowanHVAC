"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { actionRole } from "@/lib/guards";
import { notify } from "@/lib/email";
import { COMPANY } from "@/lib/constants";
import type { ActionState } from "@/lib/actions/jobs";

/** Installation proposal documents — admin-managed. */

const DEFAULT_BODY = "We hereby propose to furnish all materials and perform all labor necessary to complete the following:\n\n";

export async function createProposal(): Promise<void> {
  const admin = await actionRole("ADMIN");
  const proposal = await db.proposal.create({
    data: { createdById: admin.id, body: DEFAULT_BODY },
  });
  redirect(`/portal/admin/proposals/${proposal.id}`);
}

export async function saveProposal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");

  const existing = await db.proposal.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Proposal not found" };

  const str = (key: string, max = 191) => String(formData.get(key) ?? "").trim().slice(0, max);

  // Optional client assignment — makes the proposal visible in that client's
  // portal under Documents & Payments.
  let clientId: string | null = null;
  const rawClient = str("clientId");
  if (rawClient) {
    const client = await db.user.findFirst({ where: { id: rawClient, role: "CLIENT" } });
    if (!client) return { ok: false, error: "Invalid client" };
    clientId = client.id;
  }

  const dateRaw = str("date", 30);
  const date = dateRaw ? new Date(`${dateRaw}T12:00:00`) : existing.date;
  if (isNaN(date.getTime())) return { ok: false, error: "Invalid date" };

  const wasAssigned = existing.clientId;
  const updated = await db.proposal.update({
    where: { id },
    data: {
      title: str("title", 150) || "Proposal",
      date,
      clientId,
      customerName: str("customerName", 150),
      phone: str("phone", 40) || null,
      email: str("email", 200) || null,
      address: str("address", 400),
      body: String(formData.get("body") ?? "").slice(0, 30000),
      price: str("price", 100) || null,
      paymentTerms: String(formData.get("paymentTerms") ?? "").trim().slice(0, 5000) || null,
      note: String(formData.get("note") ?? "").trim().slice(0, 5000) || null,
    },
    include: { client: true },
  });

  // First-time assignment: let the client know the proposal is in their portal.
  if (updated.client && updated.clientId !== wasAssigned) {
    notify({
      to: [updated.client.email],
      subject: `A proposal from ${COMPANY.shortName} is ready for you`,
      body: `Hi ${updated.client.name},\n\nWe've prepared a proposal for you: ${updated.title}.\n\nView it in your portal under Documents & Payments: ${process.env.APP_URL || ""}/portal/client/billing\n\nQuestions? Call us at ${COMPANY.phone}.`,
    });
  }

  revalidatePath("/portal", "layout");
  return { ok: true };
}

export async function deleteProposal(formData: FormData): Promise<void> {
  await actionRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  await db.proposal.deleteMany({ where: { id } });
  revalidatePath("/portal", "layout");
  redirect("/portal/admin/proposals");
}
