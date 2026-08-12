"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingCart, Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { createOrderFromCart } from "../actions";
import { useLocale } from "@/i18n/locale-provider";
import { formatMessage } from "@/i18n/format";

const CUSTOMER_INFO_STORAGE_KEY = "hz-customer-info";

type StoredCustomerInfo = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
};

function getInitialFormData() {
  const empty = {
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    notes: "",
  };
  if (typeof window === "undefined") return empty;
  try {
    const raw = localStorage.getItem(CUSTOMER_INFO_STORAGE_KEY);
    if (!raw) return empty;
    return { ...empty, ...(JSON.parse(raw) as StoredCustomerInfo) };
  } catch {
    return empty;
  }
}

function saveStoredCustomerInfo(info: StoredCustomerInfo) {
  try {
    localStorage.setItem(CUSTOMER_INFO_STORAGE_KEY, JSON.stringify(info));
  } catch {
    // ignore write failures (e.g. private browsing storage limits)
  }
}

export function CartPageContent() {
  const router = useRouter();
  const { cart, removeItem, updateQuantity, clearCart } = useCart();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState(getInitialFormData);
  const { t } = useLocale();

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/" />}>
                {t.public.breadcrumbHome}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{t.publicNav.cart}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="mb-8 text-3xl font-bold">{t.publicNav.cart}</h1>
        <EmptyState
          icon={ShoppingCart}
          title={t.public.emptyCartTitle}
          description={t.public.emptyCartDescription}
          action={
            <Button
              className="cursor-pointer"
              nativeButton={false}
              render={<Link href="/products" />}
            >
              {t.public.backToProducts}
            </Button>
          }
        />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const result = await createOrderFromCart({
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        customerEmail: formData.customerEmail,
        items: cart.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        notes: formData.notes,
      });

      if (result.success) {
        saveStoredCustomerInfo({
          customerName: formData.customerName,
          customerPhone: formData.customerPhone,
          customerEmail: formData.customerEmail,
        });
        clearCart();
        router.push(`/order-confirmation/${result.orderId}`);
      } else {
        setError(result.error || t.public.genericErrorToast);
      }
    } catch {
      setError(t.public.orderProcessingError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>
              {t.public.breadcrumbHome}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t.publicNav.cart}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="mb-8 space-y-1">
        <h1 className="text-3xl font-bold">{t.publicNav.cart}</h1>
        <p className="text-sm text-muted-foreground">
          {formatMessage(t.public.cartItemsCountTemplate, { count: itemCount })}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-4">
          <div className="space-y-3">
            {cart.items.map((item) => (
              <Card key={item.productId} className="py-0">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <Link
                    href={`/products/${item.productId}`}
                    className="min-w-0 flex-1 font-medium hover:underline"
                  >
                    {item.productName}
                  </Link>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center rounded-lg border">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="cursor-pointer rounded-none"
                        disabled={isSubmitting}
                        onClick={() =>
                          updateQuantity(item.productId, item.quantity - 1)
                        }
                      >
                        <Minus className="size-4" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium tabular-nums">
                        {item.quantity}
                      </span>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="cursor-pointer rounded-none"
                        disabled={isSubmitting}
                        onClick={() =>
                          updateQuantity(item.productId, item.quantity + 1)
                        }
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="cursor-pointer text-destructive hover:text-destructive"
                      disabled={isSubmitting}
                      onClick={() => removeItem(item.productId)}
                      title={t.common.delete}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="cursor-pointer"
              nativeButton={false}
              render={<Link href="/products" />}
            >
              {t.public.continueShopping}
            </Button>
            <Button
              variant="outline"
              onClick={() => clearCart()}
              disabled={isSubmitting}
              className="text-destructive hover:text-destructive cursor-pointer"
            >
              {t.public.clearCartButton}
            </Button>
          </div>
        </div>

        {/* Checkout Form */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t.public.cartOrderSummaryTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
              <span className="text-muted-foreground">{t.public.checkoutTitle}</span>
              <span className="font-medium tabular-nums">
                {formatMessage(t.public.cartItemsCountTemplate, { count: itemCount })}
              </span>
            </div>
            {error && (
              <div className="rounded-lg border border-destructive bg-destructive/5 p-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <fieldset disabled={isSubmitting} className="contents space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t.public.fullNameRequiredLabel}</Label>
                <Input
                  id="name"
                  required
                  value={formData.customerName}
                  onChange={(e) =>
                    setFormData({ ...formData, customerName: e.target.value })
                  }
                  placeholder={t.public.fullNamePlaceholder}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">{t.public.phoneRequiredLabel}</Label>
                <Input
                  id="phone"
                  required
                  type="tel"
                  value={formData.customerPhone}
                  onChange={(e) =>
                    setFormData({ ...formData, customerPhone: e.target.value })
                  }
                  placeholder={t.public.phonePlaceholder}
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t.customers.columnEmail}</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.customerEmail}
                  onChange={(e) =>
                    setFormData({ ...formData, customerEmail: e.target.value })
                  }
                  placeholder={t.customers.columnEmail}
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">{t.orders.notesLabel}</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder={t.public.additionalNotesPlaceholder}
                  rows={3}
                />
              </div>

              <Button
                type="submit"
                className="w-full cursor-pointer"
                disabled={isSubmitting}
              >
                {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                {isSubmitting ? t.public.processingButton : t.public.submitOrderButton}
              </Button>
              </fieldset>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
