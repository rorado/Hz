"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { systemSettingsSchema } from "./schema";
import { getSystemSettingsRow } from "./queries";
import { getDictionary } from "@/i18n/server";

type ActionResult = { error?: string; success?: boolean };

export async function updateSystemSettings(
  input: unknown,
): Promise<ActionResult> {
  const access = await requirePermission("SETTINGS_MANAGE");
  if (!access.ok) return { error: access.error };
  const t = await getDictionary();

  const parsed = systemSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: t.settings.validationError };

  const data = {
    appName: parsed.data.appName,
    appShortName: parsed.data.appShortName,
    colorsLight: parsed.data.colorsLight,
    colorsDark: parsed.data.colorsDark,
  };

  const existing = await getSystemSettingsRow();
  if (existing) {
    await prisma.systemSettings.update({ where: { id: existing.id }, data });
  } else {
    await prisma.systemSettings.create({ data });
  }

  // Layout-wide revalidation: the theme CSS and app name are rendered in
  // the root layout, so every route needs to pick up the new values.
  revalidatePath("/", "layout");
  return { success: true };
}
