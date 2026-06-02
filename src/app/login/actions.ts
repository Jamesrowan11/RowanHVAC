"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type LoginState = { error?: string };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");

  try {
    // On success this throws a redirect that Next.js handles.
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/portal",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    // Re-throw redirect (and anything else) so navigation works.
    throw error;
  }
}
