"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Combobox,
  useComboboxFilter,
  ComboboxValue,
  ComboboxTrigger,
  ComboboxContent,
  ComboboxInput,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "@/components/ui/combobox";
import { useT } from "@/i18n/locale-provider";

type CategoryOption = { slug: string; name: string };

export function ProductsFilterBar({
  categories,
}: {
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const [isPending, startTransition] = useTransition();
  const { contains } = useComboboxFilter();
  const t = useT();
  const ALL_CATEGORY: CategoryOption = { slug: "all", name: t.public.allCategoryOption };

  const categoryItems = [ALL_CATEGORY, ...categories];
  const selectedCategory =
    categoryItems.find((item) => item.slug === (searchParams.get("category") ?? "all")) ??
    ALL_CATEGORY;

  useEffect(() => {
    const timeout = setTimeout(() => {
      const current = searchParams.get("q") ?? "";
      if (value === current) return;
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("q", value);
      } else {
        params.delete("q");
      }
      params.delete("page");
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    }, 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleCategoryChange(category: CategoryOption | null) {
    if (!category) return;
    const params = new URLSearchParams(searchParams.toString());
    if (category.slug === "all") {
      params.delete("category");
    } else {
      params.set("category", category.slug);
    }
    params.delete("page");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        {isPending ? (
          <Loader2 className="pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          <Search className="pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        )}
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t.public.searchProductsPlaceholder}
          className="pe-9"
        />
      </div>
      <Combobox
        items={categoryItems}
        value={selectedCategory}
        onValueChange={handleCategoryChange}
        isItemEqualToValue={(a: CategoryOption, b: CategoryOption) => a.slug === b.slug}
        itemToStringValue={(item: CategoryOption) => item.slug}
        itemToStringLabel={(item: CategoryOption) => item.name}
        filter={contains}
        disabled={isPending}
      >
        <ComboboxTrigger className="w-full sm:w-56">
          <ComboboxValue />
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput placeholder={t.categories.searchPlaceholder} />
          <ComboboxEmpty>{t.common.noResults}</ComboboxEmpty>
          <ComboboxList>
            {(item: CategoryOption) => (
              <ComboboxItem key={item.slug} value={item}>
                {item.name}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
