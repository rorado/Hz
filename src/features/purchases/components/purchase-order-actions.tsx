"use client";

import { useTransition } from "react";
import { PackageCheck, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  receivePurchaseOrder,
  cancelPurchaseOrder,
} from "@/features/purchases/actions";
import { useT } from "@/i18n/locale-provider";

export function PurchaseOrderActions({
  purchaseOrderId,
}: {
  purchaseOrderId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const t = useT();

  function handleReceive() {
    startTransition(async () => {
      const result = await receivePurchaseOrder(purchaseOrderId);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t.purchases.receivedToast);
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelPurchaseOrder(purchaseOrderId);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t.purchases.cancelledToast);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleReceive} disabled={isPending}>
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <PackageCheck className="size-4" />
        )}
        {t.purchases.receiveGoodsButton}
      </Button>
      <Button variant="outline" onClick={handleCancel} disabled={isPending}>
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <XCircle className="size-4" />
        )}
        {t.purchases.cancelOrderButton}
      </Button>
    </div>
  );
}
