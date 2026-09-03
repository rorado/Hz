"use client";

import Image from "next/image";
import { Minus, Plus, X, Trash2, ImageOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocale } from "@/i18n/locale-provider";
import { formatMessage } from "@/i18n/format";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { PAYMENT_LINE_METHODS } from "@/features/pos/schema";
import type { PosCustomer } from "@/features/pos/queries";
import type { CartLine, PosPaymentMethod } from "./types";

export function CartPanel({
  customer,
  customerBalance,
  lines,
  method,
  paidAmount,
  isPending,
  onChangeCustomer,
  onClearCustomer,
  onSetQuantity,
  onRemove,
  onClearCart,
  onHold,
  onSetMethod,
  onSetPaidAmount,
  onPay,
}: {
  customer: PosCustomer;
  customerBalance: number;
  lines: CartLine[];
  method: PosPaymentMethod;
  paidAmount: string;
  isPending: boolean;
  onChangeCustomer: () => void;
  onClearCustomer: () => void;
  onSetQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onClearCart: () => void;
  onHold: () => void;
  onSetMethod: (method: PosPaymentMethod) => void;
  onSetPaidAmount: (value: string) => void;
  onPay: () => void;
}) {
  const { locale, t } = useLocale();

  const total = lines.reduce(
    (sum, line) => sum + line.quantity * line.product.price1,
    0,
  );
  const paid = Number(paidAmount) || 0;
  const remaining = Math.max(0, total - paid);
  const isBalance = method === "BALANCE";
  // من الرصيد can't overpay itself; every other method can, and on Pay the
  // cashier is asked whether the excess extends the customer's balance.
  const excess = isBalance ? 0 : Math.max(0, paid - total);
  const balanceShort = isBalance && paid > customerBalance + 0.005;

  const methodLabels = t.statusLabels.paymentMethod;

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border bg-card xl:w-96">
      {/* Customer */}
      <div className="flex items-start gap-2 border-b p-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {customer.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{customer.name}</p>
          <p dir="ltr" className="truncate text-start text-xs text-muted-foreground">
            {customer.phone}
          </p>
        </div>
        <Button type="button" variant="outline" size="xs" onClick={onChangeCustomer}>
          {t.pos.changeCustomer}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onClearCustomer}
          aria-label={t.pos.changeCustomer}
        >
          <X />
        </Button>
      </div>

      {/* Cart header */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-semibold">
          {formatMessage(t.pos.cartTitleTemplate, { count: lines.length })}
        </span>
        {lines.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-destructive"
            onClick={onClearCart}
          >
            <Trash2 />
            {t.pos.clearCart}
          </Button>
        )}
      </div>

      {/* Lines */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        {lines.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t.pos.emptyCart}
          </p>
        ) : (
          <ul className="space-y-2 pb-2">
            {lines.map((line) => (
              <li
                key={line.product.id}
                className="flex items-center gap-2 rounded-lg border p-2"
              >
                <div className="relative size-10 shrink-0 overflow-hidden rounded bg-muted">
                  {line.product.image ? (
                    <Image
                      src={line.product.image}
                      alt={line.product.name}
                      fill
                      sizes="40px"
                      className="object-contain p-0.5"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-muted-foreground">
                      <ImageOff className="size-4" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium" title={line.product.name}>
                    {line.product.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatCurrency(line.product.price1, locale)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="outline"
                    onClick={() =>
                      onSetQuantity(line.product.id, line.quantity - 1)
                    }
                    aria-label="-"
                  >
                    <Minus />
                  </Button>
                  <Input
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (!Number.isNaN(next)) onSetQuantity(line.product.id, next);
                    }}
                    className="h-7 w-12 px-1 text-center text-xs"
                  />
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="outline"
                    onClick={() =>
                      onSetQuantity(line.product.id, line.quantity + 1)
                    }
                    aria-label="+"
                  >
                    <Plus />
                  </Button>
                </div>
                <span className="w-16 shrink-0 text-end text-xs font-semibold tabular-nums">
                  {formatCurrency(
                    line.quantity * line.product.price1,
                    locale,
                    true,
                  )}
                </span>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => onRemove(line.product.id)}
                  aria-label={t.pos.removeItem}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Totals + payment */}
      <div className="space-y-3 border-t p-3">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>{t.pos.subtotal}</span>
            <span className="tabular-nums">{formatCurrency(total, locale)}</span>
          </div>
          <div className="flex justify-between text-base font-bold">
            <span>{t.pos.total}</span>
            <span className="tabular-nums">{formatCurrency(total, locale)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              {t.pos.paymentMethodLabel}
            </label>
            <Select
              value={method}
              onValueChange={(value) => onSetMethod(value as PosPaymentMethod)}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue>
                  {(value: string) =>
                    methodLabels[value as PosPaymentMethod] ?? value
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_LINE_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {methodLabels[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              {t.pos.paidAmountLabel}
            </label>
            <Input
              inputMode="decimal"
              value={paidAmount}
              onChange={(e) => onSetPaidAmount(e.target.value)}
              className="h-9"
            />
          </div>
        </div>

        {isBalance && (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              {t.invoices.availableBalance}
            </span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                balanceShort && "text-destructive",
              )}
            >
              {formatCurrency(customerBalance, locale)}
            </span>
          </div>
        )}

        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">
            {excess > 0 ? t.pos.changeLabel : t.pos.remainingLabel}
          </span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(excess > 0 ? excess : remaining, locale)}
          </span>
        </div>

        <Button
          type="button"
          onClick={onPay}
          disabled={isPending || lines.length === 0}
          className="h-12 w-full bg-emerald-600 text-base font-bold text-white hover:bg-emerald-600/90"
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t.pos.processing}
            </>
          ) : (
            <>
              {t.pos.payButton} · {formatCurrency(total, locale)}
            </>
          )}
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={onHold}
          disabled={isPending || lines.length === 0}
          className="w-full"
        >
          {t.pos.holdCurrentSale}
        </Button>
      </div>
    </aside>
  );
}
