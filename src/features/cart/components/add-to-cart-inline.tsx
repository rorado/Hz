"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/locale-provider";

export function AddToCartInline({
  productId,
  productName,
  maxQuantity,
}: {
  productId: string;
  productName: string;
  maxQuantity: number;
}) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const t = useT();

  function handleAdd() {
    addItem(productId, productName, quantity);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex items-center rounded-lg border">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="cursor-pointer rounded-none"
          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          disabled={quantity <= 1}
        >
          <Minus className="size-4" />
        </Button>
        <span className="w-10 text-center text-sm font-medium tabular-nums">
          {quantity}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="cursor-pointer rounded-none"
          onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
          disabled={quantity >= maxQuantity}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      <Button
        size="lg"
        className="cursor-pointer"
        onClick={handleAdd}
      >
        {justAdded ? t.public.addedToCartLabel : t.public.addToCartButton}
      </Button>
    </div>
  );
}
