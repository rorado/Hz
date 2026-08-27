"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  systemSettingsSchema,
  type SystemSettingsInput,
} from "@/features/settings/schema";
import { updateSystemSettings } from "@/features/settings/actions";
import type { SystemSettingsData } from "@/features/settings/queries";
import { useLocale } from "@/i18n/locale-provider";

const COLOR_TOKEN_KEYS = [
  "primary",
  "secondary",
  "sidebar",
  "sidebarForeground",
  "header",
  "background",
  "text",
  "button",
  "accent",
] as const;

export function AppearanceForm({ settings }: { settings: SystemSettingsData }) {
  const [isPending, startTransition] = useTransition();
  const { t } = useLocale();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SystemSettingsInput>({
    resolver: zodResolver(systemSettingsSchema),
    defaultValues: settings,
  });

  function onSubmit(values: SystemSettingsInput) {
    startTransition(async () => {
      const result = await updateSystemSettings(values);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t.settings.toastUpdated);
    });
  }

  function renderThemeSection(
    theme: "colorsLight" | "colorsDark",
    title: string,
  ) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {COLOR_TOKEN_KEYS.map((key) => {
            const fieldName = `${theme}.${key}` as const;
            const value = watch(fieldName);
            return (
              <div key={fieldName} className="space-y-1.5">
                <Label htmlFor={fieldName}>{t.settings.tokens[key]}</Label>
                <div className="flex items-center gap-2">
                  <span
                    className="size-8 shrink-0 rounded border"
                    style={{ background: value }}
                  />
                  <Input id={fieldName} dir="ltr" {...register(fieldName)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <fieldset disabled={isPending} className="contents space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="app-name">{t.settings.appNameLabel}</Label>
            <Input id="app-name" {...register("appName")} />
            {errors.appName && (
              <p className="text-sm text-destructive">
                {errors.appName.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="app-short-name">{t.settings.appShortNameLabel}</Label>
            <Input id="app-short-name" {...register("appShortName")} />
            {errors.appShortName && (
              <p className="text-sm text-destructive">
                {errors.appShortName.message}
              </p>
            )}
          </div>
        </div>

        {renderThemeSection("colorsLight", t.settings.lightThemeTitle)}
        {renderThemeSection("colorsDark", t.settings.darkThemeTitle)}

        <Button type="submit" className="cursor-pointer" disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" />}
          {isPending ? t.common.saving : t.common.save}
        </Button>
      </fieldset>
    </form>
  );
}
