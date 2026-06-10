"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { notify } from "@/lib/email";
import { COMPANY } from "@/lib/constants";

const quoteSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  phone: z.string().trim().min(7, "Phone is required").max(30),
  email: z.string().trim().email("Valid email is required").max(200),
  service: z.string().trim().min(1, "Please choose a service").max(120),
  message: z.string().trim().min(1, "Message is required").max(5000),
});

export type QuoteFormState = { ok: boolean; error?: string };

export async function submitQuoteRequest(
  _prev: QuoteFormState,
  formData: FormData
): Promise<QuoteFormState> {
  const parsed = quoteSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    service: formData.get("service"),
    message: formData.get("message"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  await db.quoteRequest.create({ data: { ...data, source: "PUBLIC" } });

  // Automation: alert active admins about the new request.
  const admins = await db.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { email: true },
  });
  if (admins.length > 0) {
    notify({
      to: admins.map((a) => a.email),
      subject: `New quote request from ${data.name}`,
      body: `A new quote request just came in on ${COMPANY.name}'s website.\n\nName: ${data.name}\nPhone: ${data.phone}\nEmail: ${data.email}\nService: ${data.service}\n\nMessage:\n${data.message}\n\nView it in the admin dashboard: ${process.env.APP_URL || ""}/portal/admin/requests`,
    });
  }

  return { ok: true };
}
