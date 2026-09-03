"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search, ChevronDown, Loader2, ArrowRight, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/i18n/locale-provider";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { customerSchema, type CustomerInput } from "@/features/customers/schema";
import {
  searchPosCustomersAction,
  createPosCustomerAction,
} from "@/features/pos/actions";
import type { PosCustomer } from "@/features/pos/queries";

export function CustomerStep({
  initialCustomers,
  onSelect,
}: {
  initialCustomers: { items: PosCustomer[]; hasMore: boolean };
  onSelect: (customer: PosCustomer) => void;
}) {
  const { locale, t } = useLocale();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosCustomer[]>(initialCustomers.items);
  const [hasMore, setHasMore] = useState(initialCustomers.hasMore);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const timeout = setTimeout(async () => {
      setSearching(true);
      const data = await searchPosCustomersAction(query, 0);
      if (requestId !== requestIdRef.current) return;
      setResults(data.items);
      setHasMore(data.hasMore);
      setSearching(false);
      scrollRef.current?.scrollTo({ top: 0 });
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  const offset = results.length;
  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    const data = await searchPosCustomersAction(query, offset);
    setResults((prev) => [...prev, ...data.items]);
    setHasMore(data.hasMore);
    setLoadingMore(false);
  }, [query, offset]);

  // Infinite scroll: load the next page when the sentinel enters the
  // results viewport.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) loadMore();
      },
      { root, rootMargin: "120px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 overflow-y-auto p-6">
      <Stepper t={t} />

      <div className="grid flex-1 items-start gap-4 lg:grid-cols-[1fr_auto_1fr]">
        {/* Search existing */}
        <div className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">
            {t.pos.selectCustomerTitle}
          </h2>
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.pos.customerSearchPlaceholder}
              className="ps-9"
            />
          </div>

          <div
            ref={scrollRef}
            className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto lg:max-h-[calc(100vh-20rem)]"
          >
            {searching && results.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto size-4 animate-spin" />
              </p>
            ) : results.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t.pos.noCustomersFound}
              </p>
            ) : (
              results.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => onSelect(customer)}
                  className="flex w-full items-center gap-3 rounded-lg border p-2.5 text-start transition-colors hover:bg-muted"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {customer.name.charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {customer.name}
                    </span>
                    <span dir="ltr" className="block truncate text-start text-xs text-muted-foreground">
                      {customer.phone}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <span className="block text-[11px] text-muted-foreground">
                      {t.pos.balanceLabel}
                    </span>
                    <span
                      className={cn(
                        "block text-xs font-semibold tabular-nums",
                        customer.balance < 0 && "text-destructive",
                      )}
                    >
                      {formatCurrency(customer.balance, locale)}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                </button>
              ))
            )}

            <div ref={sentinelRef} className="h-px w-full" />

            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="flex w-full items-center justify-center gap-1.5 py-2 text-sm font-medium text-primary"
              >
                {loadingMore ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
                {t.pos.viewMoreCustomers}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground lg:flex-col lg:py-0">
          <span className="lg:my-4">{t.pos.or}</span>
        </div>

        {/* Create new */}
        <NewCustomerForm onCreated={onSelect} />
      </div>
    </div>
  );
}

function Stepper({ t }: { t: ReturnType<typeof useLocale>["t"] }) {
  return (
    <div className="flex items-center justify-center gap-3 text-sm">
      <span className="flex items-center gap-2 font-semibold text-primary">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
          1
        </span>
        {t.pos.stepCustomer}
      </span>
      <span className="h-px w-10 bg-border" />
      <span className="flex items-center gap-2 text-muted-foreground">
        <span className="flex size-6 items-center justify-center rounded-full border text-xs">
          2
        </span>
        {t.pos.stepSelling}
      </span>
    </div>
  );
}

function NewCustomerForm({
  onCreated,
}: {
  onCreated: (customer: PosCustomer) => void;
}) {
  const { t } = useLocale();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      address: "",
      notes: "",
      isFavorite: false,
    },
  });

  function onSubmit(values: CustomerInput) {
    startTransition(async () => {
      const result = await createPosCustomerAction(values);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(t.pos.customerCreatedToast);
      onCreated({
        id: result.customerId,
        name: values.name,
        phone: values.phone,
        email: values.email || null,
        balance: 0,
      });
    });
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rounded-xl border bg-card p-4"
    >
      <h2 className="mb-3 text-sm font-semibold">{t.pos.createCustomerTitle}</h2>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="pos-cust-name">
            {t.pos.fullNameLabel} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="pos-cust-name"
            placeholder={t.pos.fullNamePlaceholder}
            {...register("name")}
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pos-cust-phone">{t.pos.phoneLabel}</Label>
            <Input
              id="pos-cust-phone"
              dir="ltr"
              placeholder={t.pos.phonePlaceholder}
              {...register("phone")}
            />
            {errors.phone && (
              <p className="text-xs text-destructive">{errors.phone.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pos-cust-email">{t.pos.emailLabel}</Label>
            <Input
              id="pos-cust-email"
              dir="ltr"
              placeholder={t.pos.emailPlaceholder}
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pos-cust-address">{t.pos.addressLabel}</Label>
          <Input
            id="pos-cust-address"
            placeholder={t.pos.addressPlaceholder}
            {...register("address")}
          />
        </div>
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UserPlus className="size-4" />
          )}
          {t.pos.createCustomerButton}
          <ArrowRight className="size-4 rtl:rotate-180" />
        </Button>
      </div>
    </form>
  );
}
