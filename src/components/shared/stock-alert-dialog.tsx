"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocale } from "@/i18n/locale-provider";
import { formatMessage } from "@/i18n/format";

export type StockIssue = {
  product: string;
  requested: number;
  available: number;
};

export function findStockIssue(
  items: Array<{ productId?: string | null; quantity: unknown }>,
  products: Array<{ id: string; name: string; quantity: number }>,
): StockIssue | null {
  const totals = new Map<string, number>();
  items.forEach((item) => {
    if (item.productId) totals.set(item.productId, (totals.get(item.productId) ?? 0) + (Number(item.quantity) || 0));
  });
  for (const product of products) {
    const requested = totals.get(product.id) ?? 0;
    if (requested > product.quantity) {
      return { product: product.name, requested, available: product.quantity };
    }
  }
  return null;
}

export function StockAlertDialog({ issue, onClose, onConfirm }: { issue: StockIssue | null; onClose: () => void; onConfirm: () => void }) {
  const { t } = useLocale();
  const [allowNegative, setAllowNegative] = useState(false);
  function close() {
    setAllowNegative(false);
    onClose();
  }
  return (
    <AlertDialog open={Boolean(issue)} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive"><AlertTriangle /></AlertDialogMedia>
          <AlertDialogTitle>{t.common.insufficientStockTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {issue && formatMessage(t.common.insufficientProductStockTemplate, issue)}
            <span className="mt-2 block">{t.common.negativeStockWarning}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <Checkbox checked={allowNegative} onCheckedChange={(checked) => setAllowNegative(checked === true)} />
          <span>{t.common.allowNegativeStock}</span>
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={close}>{t.common.reviewQuantity}</AlertDialogCancel>
          <Button disabled={!allowNegative} onClick={() => { setAllowNegative(false); onConfirm(); }}>{t.common.continueAnyway}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
