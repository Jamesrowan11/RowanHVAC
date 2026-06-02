"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertRole } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { sendEmail } from "@/lib/email";
import { storeFile, deleteFile, ALLOWED_MIME, MAX_UPLOAD_BYTES } from "@/lib/uploads";

// ---------- Requests ----------

export async function deleteRequest(formData: FormData) {
  await assertRole("ADMIN");
  const id = String(formData.get("id"));
  await prisma.request.delete({ where: { id } });
  revalidatePath("/portal/admin/requests");
  revalidatePath("/portal/admin");
}

export async function updateRequestStatus(formData: FormData) {
  await assertRole("ADMIN");
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  const allowed = ["NEW", "REVIEWED", "SCHEDULED", "CLOSED"];
  if (!allowed.includes(status)) throw new Error("Invalid status");
  await prisma.request.update({
    where: { id },
    data: { status: status as never },
  });
  revalidatePath("/portal/admin/requests");
}

// ---------- Jobs / scheduling ----------

const jobSchema = z.object({
  clientId: z.string().optional(),
  customerName: z.string().min(2).max(160),
  address: z.string().min(3).max(300),
  serviceNeeded: z.string().min(2).max(200),
  scheduledDate: z.string().min(1),
  scheduledTime: z.string().min(1).max(40),
  technicianId: z.string().optional(),
});

export async function createJob(formData: FormData) {
  await assertRole("ADMIN");
  const parsed = jobSchema.parse({
    clientId: formData.get("clientId") || undefined,
    customerName: formData.get("customerName"),
    address: formData.get("address"),
    serviceNeeded: formData.get("serviceNeeded"),
    scheduledDate: formData.get("scheduledDate"),
    scheduledTime: formData.get("scheduledTime"),
    technicianId: formData.get("technicianId") || undefined,
  });

  // Only allow assigning to active employees/admins.
  let technicianId: string | null = null;
  if (parsed.technicianId) {
    const tech = await prisma.user.findFirst({
      where: {
        id: parsed.technicianId,
        active: true,
        role: { in: ["EMPLOYEE", "ADMIN"] },
      },
      select: { id: true },
    });
    technicianId = tech?.id ?? null;
  }

  let clientId: string | null = null;
  if (parsed.clientId) {
    const client = await prisma.user.findFirst({
      where: { id: parsed.clientId, role: "CLIENT" },
      select: { id: true },
    });
    clientId = client?.id ?? null;
  }

  await prisma.job.create({
    data: {
      customerName: parsed.customerName.trim(),
      address: parsed.address.trim(),
      serviceNeeded: parsed.serviceNeeded.trim(),
      scheduledDate: new Date(parsed.scheduledDate),
      scheduledTime: parsed.scheduledTime.trim(),
      technicianId,
      clientId,
      status: "SCHEDULED",
    },
  });

  // If this job came from a request, mark it scheduled.
  const fromRequest = formData.get("requestId");
  if (fromRequest) {
    await prisma.request.update({
      where: { id: String(fromRequest) },
      data: { status: "SCHEDULED" },
    });
  }

  revalidatePath("/portal/admin/schedule");
  revalidatePath("/portal/admin");
}

export async function cancelJob(formData: FormData) {
  await assertRole("ADMIN");
  const id = String(formData.get("id"));
  const reason = String(formData.get("reason") || "").trim();
  if (!reason) throw new Error("A cancellation reason is required");
  await prisma.job.update({
    where: { id },
    data: { status: "CANCELLED", cancelReason: reason },
  });
  revalidatePath("/portal/admin/schedule");
  revalidatePath("/portal/admin");
}

export async function reinstateJob(formData: FormData) {
  await assertRole("ADMIN");
  const id = String(formData.get("id"));
  await prisma.job.update({
    where: { id },
    data: { status: "SCHEDULED", cancelReason: null },
  });
  revalidatePath("/portal/admin/schedule");
  revalidatePath("/portal/admin");
}

// ---------- Users / employees ----------

const userSchema = z.object({
  name: z.string().min(2).max(160),
  email: z.string().email().max(160),
  phone: z.string().max(40).optional(),
  role: z.enum(["CLIENT", "EMPLOYEE", "ADMIN"]),
});

export async function createUser(formData: FormData) {
  await assertRole("ADMIN");
  const parsed = userSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    role: formData.get("role"),
  });
  const password = String(formData.get("password") || "");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const email = parsed.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("A user with that email already exists");

  await prisma.user.create({
    data: {
      name: parsed.name.trim(),
      email,
      phone: parsed.phone?.trim() || null,
      role: parsed.role,
      passwordHash: await hashPassword(password),
    },
  });
  revalidatePath("/portal/admin/users");
}

export async function updateUser(formData: FormData) {
  await assertRole("ADMIN");
  const id = String(formData.get("id"));
  const parsed = userSchema.partial({ role: true }).parse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    role: formData.get("role") || undefined,
  });
  const email = parsed.email!.toLowerCase().trim();

  const clash = await prisma.user.findFirst({
    where: { email, NOT: { id } },
    select: { id: true },
  });
  if (clash) throw new Error("Another user already uses that email");

  await prisma.user.update({
    where: { id },
    data: {
      name: parsed.name!.trim(),
      email,
      phone: parsed.phone?.trim() || null,
      ...(parsed.role ? { role: parsed.role } : {}),
    },
  });
  revalidatePath("/portal/admin/users");
}

export async function resetUserPassword(formData: FormData) {
  await assertRole("ADMIN");
  const id = String(formData.get("id"));
  const password = String(formData.get("password") || "");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(password) },
  });
  revalidatePath("/portal/admin/users");
}

export async function setUserActive(formData: FormData) {
  const admin = await assertRole("ADMIN");
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  if (id === admin.id && !active) {
    throw new Error("You cannot deactivate your own account");
  }
  await prisma.user.update({ where: { id }, data: { active } });
  revalidatePath("/portal/admin/users");
}

export async function deleteUser(formData: FormData) {
  const admin = await assertRole("ADMIN");
  const id = String(formData.get("id"));
  if (id === admin.id) throw new Error("You cannot delete your own account");
  await prisma.user.delete({ where: { id } });
  revalidatePath("/portal/admin/users");
}

// ---------- Maintenance policies ----------

export async function upsertMaintenancePolicy(formData: FormData) {
  await assertRole("ADMIN");
  const clientId = String(formData.get("clientId"));
  const active = String(formData.get("active")) === "true";
  const renewalRaw = String(formData.get("renewalDate") || "");
  const renewalDate = renewalRaw ? new Date(renewalRaw) : null;

  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true },
  });
  if (!client) throw new Error("Client not found");

  await prisma.maintenancePolicy.upsert({
    where: { clientId },
    create: { clientId, active, renewalDate },
    update: { active, renewalDate },
  });
  revalidatePath("/portal/admin/maintenance");
}

// ---------- Announcements ----------

export async function createAnnouncement(formData: FormData) {
  const admin = await assertRole("ADMIN");
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!title || !body) throw new Error("Title and body are required");
  await prisma.announcement.create({
    data: { title, body, authorId: admin.id },
  });
  revalidatePath("/portal/admin/announcements");
}

export async function deleteAnnouncement(formData: FormData) {
  await assertRole("ADMIN");
  const id = String(formData.get("id"));
  await prisma.announcement.delete({ where: { id } });
  revalidatePath("/portal/admin/announcements");
}

// ---------- Payments ----------

export async function createPaymentLink(formData: FormData) {
  const admin = await assertRole("ADMIN");
  const clientId = String(formData.get("clientId"));
  const url = String(formData.get("url") || "").trim();
  const label = String(formData.get("label") || "").trim() || null;
  const amount = String(formData.get("amount") || "").trim() || null;
  const notify = String(formData.get("notify")) === "on";

  if (!/^https?:\/\//i.test(url)) throw new Error("Enter a valid http(s) URL");

  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true, email: true, name: true },
  });
  if (!client) throw new Error("Client not found");

  await prisma.paymentLink.create({
    data: { clientId, createdById: admin.id, url, label, amount, status: "SENT" },
  });

  if (notify) {
    await sendEmail({
      to: [client.email],
      subject: "A payment link from Rowan Heating & Air Conditioning",
      body: `Hello ${client.name},\n\nWe've shared a payment link with you in your Rowan customer portal${
        amount ? ` for ${amount}` : ""
      }. You can review and pay it here:\n\n${url}\n\nThank you for your business.`,
      senderUserId: admin.id,
    });
  }

  revalidatePath("/portal/admin/payments");
}

export async function markPaymentPaid(formData: FormData) {
  await assertRole("ADMIN");
  const id = String(formData.get("id"));
  await prisma.paymentLink.update({
    where: { id },
    data: { status: "PAID", paidAt: new Date() },
  });
  revalidatePath("/portal/admin/payments");
}

export async function deletePaymentLink(formData: FormData) {
  await assertRole("ADMIN");
  const id = String(formData.get("id"));
  await prisma.paymentLink.delete({ where: { id } });
  revalidatePath("/portal/admin/payments");
}

// ---------- Documents ----------

export async function uploadDocument(formData: FormData) {
  const admin = await assertRole("ADMIN");
  const clientId = String(formData.get("clientId"));
  const notify = String(formData.get("notify")) === "on";
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Please choose a file");
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is too large (max 10MB)");
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error("Only PDF and image files are allowed");
  }

  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true, email: true, name: true },
  });
  if (!client) throw new Error("Client not found");

  const stored = await storeFile(file);
  await prisma.document.create({
    data: {
      clientId,
      uploadedById: admin.id,
      originalName: file.name,
      storedName: stored.storedName,
      mimeType: stored.mimeType,
      size: stored.size,
    },
  });

  if (notify) {
    await sendEmail({
      to: [client.email],
      subject: "A new document from Rowan Heating & Air Conditioning",
      body: `Hello ${client.name},\n\nWe've shared a new document ("${file.name}") with you. You can view and download it in your Rowan customer portal under Documents & Payments.\n\nThank you.`,
      senderUserId: admin.id,
    });
  }

  revalidatePath("/portal/admin/payments");
}

export async function deleteDocument(formData: FormData) {
  await assertRole("ADMIN");
  const id = String(formData.get("id"));
  const doc = await prisma.document.findUnique({ where: { id } });
  if (doc) {
    await deleteFile(doc.storedName);
    await prisma.document.delete({ where: { id } });
  }
  revalidatePath("/portal/admin/payments");
}
