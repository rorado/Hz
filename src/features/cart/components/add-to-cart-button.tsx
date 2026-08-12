"use client";

import { useState, type ComponentProps } from "react";
import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/locale-provider";

interface AddToCartButtonProps extends ComponentProps<typeof Button> {
  productId: string;
  productName: string;
}

export function AddToCartButton({
  productId,
  productName,
  className,
  size = "lg",
  ...props
}: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [isOpen, setIsOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const t = useT();

  const handleAddToCart = () => {
    addItem(productId, productName, quantity);
    setIsOpen(false);
    setQuantity(1);
  };

  return (
    <>
      <Button
        size={size}
        className={cn("w-full cursor-pointer sm:w-auto", className)}
        onClick={() => setIsOpen(true)}
        {...props}
      >
        {t.public.addToCartButton}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.public.addToCartButton}</DialogTitle>
            <DialogDescription>{productName}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">{t.purchases.quantityLabel}</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                max="999"
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(1, parseInt(e.target.value) || 1))
                }
                className="text-center"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                className="flex-1 cursor-pointer"
              >
                {t.common.cancel}
              </Button>
              <Button
                onClick={handleAddToCart}
                className="flex-1 cursor-pointer"
              >
                {t.public.addToCartButton}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
