"use client";

import { useTransition } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  purchaseOrderItemsSchema,
  type PurchaseOrderItemsInput,
  type PurchaseOrderItemsOutput,
} from "@/features/purchases/schema";
import { updatePurchaseOrderItems } from "@/features/purchases/actions";
import { formatCurrency } from "@/lib/currency";
import { useLocale } from "@/i18n/locale-provider";
import type { Dictionary } from "@/i18n/dictionaries";
import { ProductBarcodeScanner } from "@/components/shared/barcode-scanner";
import { QuickProductAddPanel } from "@/components/shared/quick-product-add-panel";

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  categoryId: string;
  categoryName: string;
  brandId: string | null;
  brandName: string | null;
  price1: number;
  price2: number;
  price3: number;
};

function productLabel(product: ProductOption, none: string) {
  return product.id ? `${product.name} (${product.sku})` : none;
}

function ProductPickerField({
  value,
  onChange,
  products,
  t,
}: {
  value: string;
  onChange: (product: ProductOption | null) => void;
  products: ProductOption[];
  t: Dictionary;
}) {
  const { contains } = useComboboxFilter();
  const noneProduct: ProductOption = {
    id: "",
    name: t.orders.selectProductPlaceholder,
    sku: "",
    barcode: null,
    categoryId: "", categoryName: "", brandId: null, brandName: null,
    price1: 0,
    price2: 0,
    price3: 0,
  };
  const items = [noneProduct, ...products];
  const selected = items.find((item) => item.id === value) ?? noneProduct;

  return (
    <Combobox
      items={items}
      value={selected}
      onValueChange={(product: ProductOption | null) => onChange(product)}
      isItemEqualToValue={(a: ProductOption, b: ProductOption) => a.id === b.id}
      itemToStringValue={(item: ProductOption) => item.id}
      itemToStringLabel={(item: ProductOption) =>
        productLabel(item, t.orders.selectProductPlaceholder)
      }
      filter={contains}
    >
      <div className="flex gap-2">
        <ComboboxTrigger className="w-full"><ComboboxValue /></ComboboxTrigger>
        <ProductBarcodeScanner products={products} onSelect={onChange} />
      </div>
      <ComboboxContent>
        <ComboboxInput placeholder={t.inventory.productSearchPlaceholder} />
        <ComboboxEmpty>{t.common.noResults}</ComboboxEmpty>
        <ComboboxList>
          {(item: ProductOption) => (
            <ComboboxItem key={item.id} value={item}>
              {productLabel(item, t.orders.selectProductPlaceholder)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export function PurchaseOrderItemsForm({
  purchaseOrderId,
  items,
  products,
}: {
  purchaseOrderId: string;
  items: { productId: string; quantity: number; unitCost: number }[];
  products: ProductOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const { t, locale } = useLocale();

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PurchaseOrderItemsInput, unknown, PurchaseOrderItemsOutput>({
    resolver: zodResolver(purchaseOrderItemsSchema),
    defaultValues: {
      items: items.length
        ? items.map((item) => ({
            ...item,
            updateProductPurchasePrice: true,
          }))
        : [{ productId: "", quantity: 1, unitCost: 0, updateProductPurchasePrice: true }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const watchedItems = watch("items");
  const total = watchedItems.reduce(
    (sum, item) =>
      sum + (Number(item.quantity) || 0) * (Number(item.unitCost) || 0),
    0,
  );

  function onSubmit(values: PurchaseOrderItemsOutput) {
    startTransition(async () => {
      const result = await updatePurchaseOrderItems(purchaseOrderId, values);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t.purchases.itemsUpdatedToast);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <fieldset disabled={isPending} className="contents space-y-4">
        <Label>{t.purchases.itemsLabel}</Label>
        <QuickProductAddPanel products={products} onAddProducts={(selected) => selected.forEach((product) => append({ productId: product.id, quantity: 1, unitCost: 0, updateProductPurchasePrice: true }))} />
        <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
          {t.purchases.updateProductPurchasePriceHelp}
        </p>

        <div
          className={
            fields.length > 5
              ? "max-h-120 space-y-3 overflow-y-auto pe-1"
              : "space-y-3"
          }
        >
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid grid-cols-1 items-end gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto_auto]"
            >
              <div className="space-y-1">
                <Label className="text-xs">{t.purchases.productLabel}</Label>
                <Controller
                  control={control}
                  name={`items.${index}.productId`}
                  render={({ field: productField }) => (
                    <ProductPickerField
                      value={productField.value ?? ""}
                      products={products}
                      onChange={(product) => {
                        productField.onChange(product?.id ?? "");
                        setValue(`items.${index}.unitCost`, 0);
                      }}
                      t={t}
                    />
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t.purchases.quantityLabel}</Label>
                <Input
                  type="number"
                  min={1}
                  className="w-24"
                  {...register(`items.${index}.quantity`)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t.purchases.unitCostLabel}</Label>
                <div className="w-32">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    {...register(`items.${index}.unitCost`)}
                  />
                </div>
                <Controller
                  control={control}
                  name={`items.${index}.updateProductPurchasePrice`}
                  render={({ field }) => (
                    <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs">
                      <Checkbox
                        checked={field.value ?? false}
                        onCheckedChange={(checked) =>
                          field.onChange(checked === true)
                        }
                      />
                      <span>{t.purchases.updateProductPurchasePriceLabel}</span>
                    </label>
                  )}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="cursor-pointer"
                onClick={() => remove(index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        {errors.items?.message && (
          <p className="text-sm text-destructive">{errors.items.message}</p>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="cursor-pointer"
          onClick={() => append({ productId: "", quantity: 1, unitCost: 0, updateProductPurchasePrice: true })}
        >
          <Plus className="size-4" />
          {t.purchases.addItemButton}
        </Button>

        <div className="flex items-center justify-between border-t pt-4">
          <p className="font-medium">{t.purchases.totalLabel}: {formatCurrency(total, locale)}</p>
          <Button type="submit" className="cursor-pointer" disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {isPending ? t.common.saving : t.purchases.saveChangesButton}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
