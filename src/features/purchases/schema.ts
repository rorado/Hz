import { z } from "zod";

export const purchaseOrderItemSchema = z.object({
  productId: z.string().min(1, { error: "الرجاء اختيار المنتج" }),
  quantity: z.coerce
    .number()
    .int()
    .min(1, { error: "الكمية يجب أن تكون رقماً موجباً" }),
  unitCost: z.coerce
    .number()
    .min(0, { error: "التكلفة يجب أن تكون رقماً موجباً" }),
});

export const purchaseOrderSchema = z.object({
  supplierId: z.string().min(1, { error: "الرجاء اختيار المورد" }),
  language: z.enum(["AR", "FR"]).default("AR"),
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.coerce.number().int().min(1),
        unitCost: z.coerce.number().min(0),
      }),
    )
    .refine((items) => items.some((item) => item.productId !== ""), {
      error: "أضف عنصراً واحداً على الأقل",
    })
    .transform((items) => items.filter((item) => item.productId !== "")),
});

export type PurchaseOrderInput = z.input<typeof purchaseOrderSchema>;
export type PurchaseOrderOutput = z.output<typeof purchaseOrderSchema>;

export const purchaseOrderItemsSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.coerce.number().int().min(1),
        unitCost: z.coerce.number().min(0),
      }),
    )
    .refine((items) => items.some((item) => item.productId !== ""), {
      error: "أضف عنصراً واحداً على الأقل",
    })
    .transform((items) => items.filter((item) => item.productId !== "")),
});

export type PurchaseOrderItemsInput = z.input<typeof purchaseOrderItemsSchema>;
export type PurchaseOrderItemsOutput = z.output<typeof purchaseOrderItemsSchema>;
