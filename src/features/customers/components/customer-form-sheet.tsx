"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Star } from "lucide-react";
import { FormSheet } from "@/components/shared/form-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  customerSchema,
  type CustomerInput,
} from "@/features/customers/schema";
import {
  createCustomer,
  updateCustomer,
  findCustomerByPhoneAction,
} from "@/features/customers/actions";
import { cn } from "@/lib/utils";
import { useLocale } from "@/i18n/locale-provider";

type MatchingCustomer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
};

type CustomerRecord = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  isFavorite: boolean;
} | null;

export function CustomerFormSheet({
  open,
  customer,
  onOpenChange,
}: {
  open: boolean;
  customer?: CustomerRecord;
  /** Overrides the default URL-param-driven close behavior (used on the customers list page). */
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const { t } = useLocale();

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: customer?.name ?? "",
      phone: customer?.phone ?? "",
      email: customer?.email ?? "",
      address: customer?.address ?? "",
      notes: customer?.notes ?? "",
      isFavorite: customer?.isFavorite ?? false,
    },
  });

  const phoneValue = watch("phone");
  const [matchingCustomers, setMatchingCustomers] = useState<MatchingCustomer[]>(
    [],
  );

  useEffect(() => {
    if (customer || !phoneValue || phoneValue.trim().length < 6) {
      setMatchingCustomers([]);
      return;
    }
    const timeout = setTimeout(() => {
      findCustomerByPhoneAction(phoneValue).then(setMatchingCustomers);
    }, 400);
    return () => clearTimeout(timeout);
  }, [phoneValue, customer]);

  function close() {
    if (onOpenChange) {
      onOpenChange(false);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    params.delete("edit");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function onSubmit(values: CustomerInput) {
    startTransition(async () => {
      const result = customer
        ? await updateCustomer(customer.id, values)
        : await createCustomer(values);

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      toast.success(customer ? t.customers.toastUpdated : t.customers.toastCreated);
      close();
    });
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={customer ? t.customers.formTitleEdit : t.customers.formTitleAdd}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <fieldset disabled={isPending} className="contents space-y-4">
        <div className="space-y-2">
          <Label htmlFor="customer-name">{t.customers.fullNameLabel}</Label>
          <Input
            id="customer-name"
            placeholder={t.customers.fullNamePlaceholder}
            {...register("name")}
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>
        <Controller
          control={control}
          name="isFavorite"
          render={({ field }) => (
            <button
              type="button"
              onClick={() => field.onChange(!field.value)}
              aria-pressed={field.value}
              className={cn(
                "flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-start transition-colors",
                field.value
                  ? "border-amber-500/50 bg-amber-500/10"
                  : "border-input hover:bg-muted/50",
              )}
            >
              <Star
                className={cn(
                  "size-5 shrink-0 transition-colors",
                  field.value
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground",
                )}
              />
              <div>
                <p className="text-sm font-medium">{t.customers.favoriteToggleTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {t.customers.favoriteToggleDescription}
                </p>
              </div>
            </button>
          )}
        />
        <div className="space-y-2">
          <Label htmlFor="customer-phone">{t.customers.phoneWhatsappLabel}</Label>
          <Input id="customer-phone" dir="ltr" {...register("phone")} />
          {errors.phone && (
            <p className="text-sm text-destructive">{errors.phone.message}</p>
          )}
          {matchingCustomers.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
              <p className="mb-1 font-medium">
                {t.customers.matchingPhoneHint}
              </p>
              <ul className="space-y-1">
                {matchingCustomers.map((match) => (
                  <li key={match.id}>
                    <button
                      type="button"
                      className="text-primary underline-offset-2 hover:underline"
                      onClick={() => {
                        const params = new URLSearchParams(
                          searchParams.toString(),
                        );
                        params.delete("new");
                        params.set("edit", match.id);
                        router.push(`${pathname}?${params.toString()}`);
                      }}
                    >
                      {match.name} — {match.phone}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="customer-email">{t.customers.emailOptionalLabel}</Label>
          <Input id="customer-email" dir="ltr" {...register("email")} />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="customer-address">{t.customers.addressOptionalLabel}</Label>
          <Input id="customer-address" {...register("address")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customer-notes">{t.customers.notesOptionalLabel}</Label>
          <Textarea id="customer-notes" rows={3} {...register("notes")} />
        </div>
        <Button
          type="submit"
          className="w-full cursor-pointer"
          disabled={isPending}
        >
          {isPending && <Loader2 className="size-4 animate-spin" />}
          {isPending ? t.common.saving : t.common.save}
        </Button>
      </fieldset>
      </form>
    </FormSheet>
  );
}
