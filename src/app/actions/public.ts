"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().min(2, "Please enter your name").max(120),
  phone: z.string().min(7, "Please enter a phone number").max(40),
  email: z.string().email("Please enter a valid email").max(160),
  serviceNeeded: z.string().min(1, "Please choose a service").max(120),
  message: z.string().max(4000).optional(),
});

export type QuoteFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function submitQuoteRequest(
  _prev: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    serviceNeeded: formData.get("serviceNeeded"),
    message: formData.get("message") || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, error: "Please fix the errors below.", fieldErrors };
  }

  const data = parsed.data;
  await prisma.request.create({
    data: {
      type: "QUOTE",
      status: "NEW",
      name: data.name.trim(),
      phone: data.phone.trim(),
      email: data.email.toLowerCase().trim(),
      serviceNeeded: data.serviceNeeded,
      message: data.message?.trim() || null,
    },
  });

  return { ok: true };
}
