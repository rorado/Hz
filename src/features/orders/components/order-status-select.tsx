"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getOrderStockIssue, updateOrderStatus } from "@/features/orders/actions";
import { StockAlertDialog, type StockIssue } from "@/components/shared/stock-alert-dialog";
import { useLocale } from "@/i18n/locale-provider";
import type { OrderStatus } from "@/generated/prisma/client";

const ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "CANCELLED",
];

export function OrderStatusSelect({
  orderId,
  status,
}: {
  orderId: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [stockIssue, setStockIssue] = useState<StockIssue | null>(null);
  const { t } = useLocale();

  function applyStatus(value: string, allowNegativeStock = false) {
    startTransition(async () => {
      const result = await updateOrderStatus(orderId, value as OrderStatus, { allowNegativeStock });
      if (result?.error) { toast.error(result.error); return; }
      toast.success(t.orders.statusUpdatedToast);
    });
  }

  function handleChange(value: string | null) {
    if (!value) return;
    startTransition(async () => {
      if (value === "COMPLETED") {
        const issue = await getOrderStockIssue(orderId);
        if (issue) {
          setStockIssue(issue);
          return;
        }
      }
      applyStatus(value);
    });
  }

  return (
    <>
      <StockAlertDialog
        issue={stockIssue}
        onClose={() => setStockIssue(null)}
        onConfirm={() => {
          setStockIssue(null);
          applyStatus("COMPLETED", true);
        }}
      />
      <Select value={status} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue>
            {(value: string) =>
              t.statusLabels.order[value as keyof typeof t.statusLabels.order] ??
              value
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {ORDER_STATUSES.map((value) => (
            <SelectItem key={value} value={value}>
              {t.statusLabels.order[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
