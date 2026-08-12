"use client";

import * as React from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { setLocale as setLocaleAction } from "@/i18n/actions";

type LocaleContextValue = {
  locale: Locale;
  t: Dictionary;
  setLocale: (locale: Locale) => void;
  isPending: boolean;
};

const LocaleContext = React.createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  children: React.ReactNode;
}) {
  const [isPending, startTransition] = React.useTransition();

  const setLocale = React.useCallback(
    (next: Locale) => {
      if (next === locale) return;
      startTransition(async () => {
        await setLocaleAction(next);
        // Full reload so every Server Component (including the root
        // layout's lang/dir) re-renders in the new locale.
        window.location.reload();
      });
    },
    [locale],
  );

  const value = React.useMemo<LocaleContextValue>(
    () => ({ locale, t: dictionary, setLocale, isPending }),
    [locale, dictionary, setLocale, isPending],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = React.useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return ctx;
}

export function useT() {
  return useLocale().t;
}
