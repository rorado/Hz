import { z } from "zod";
import { PAYMENT_LINE_METHODS } from "@/features/invoices/schema";

export { PAYMENT_LINE_METHODS };

export const posSaleSchema = z.object({
  saleToken: z.string().uuid(),
  customerId: z.string().min(1),
  language: z.enum(["AR", "EN", "FR"]),
  // The POS only ever sells at the product's first price — the server
  // re-reads it, so the client sends product + quantity only.
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().min(0.001),
      }),
    )
    .min(1),
  payment: z.object({
    method: z.enum(PAYMENT_LINE_METHODS),
    // Amount tendered by the customer. For نقداً / من الرصيد only min(amount,
    // total) is applied to the invoice — extra نقداً is change, and paying
    // extra من الرصيد would just credit the balance onto itself. For card /
    // transfer / other, any amount past the total is kept as customer credit
    // (same as createInvoice's excessToBalance).
    amount: z.coerce.number().min(0),
    // Lets a من الرصيد payment proceed past the customer's current balance
    // (mirrors the dashboard "allow negative balance" confirmation).
    allowNegativeBalance: z.boolean().optional(),
    // When the tendered amount is over the total, whether the cashier chose
    // to add the excess to the customer's balance (default: no — cash change
    // / discarded).
    excessToBalance: z.boolean().optional(),
  }),
});

export type PosSaleInput = z.input<typeof posSaleSchema>;
export type PosSaleOutput = z.output<typeof posSaleSchema>;
