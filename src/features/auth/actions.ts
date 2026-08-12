"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import { getDictionary } from "@/i18n/server";

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const t = await getDictionary();
      switch (error.type) {
        case "CredentialsSignin":
          return t.auth.invalidCredentials;
        default:
          return t.auth.genericError;
      }
    }
    throw error;
  }
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
