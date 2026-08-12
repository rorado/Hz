export const locales = ["ar", "en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ar";

export const localeDirection: Record<Locale, "rtl" | "ltr"> = {
  ar: "rtl",
  en: "ltr",
  fr: "ltr",
};

export const localeLabels: Record<Locale, string> = {
  ar: "العربية",
  en: "English",
  fr: "Français",
};

/** Short code shown in the language-switcher badge. */
export const localeCodes: Record<Locale, string> = {
  ar: "AR",
  en: "EN",
  fr: "FR",
};

export const LOCALE_COOKIE = "locale";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
