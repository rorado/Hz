"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { invoiceSchema } from "@/features/invoices/schema";
import { getCustomerOutstandingInvoices } from "@/features/invoices/queries";
import { computePaymentStatus } from "@/lib/money";
import { adjustCustomerBalance, computeBalanceEffect } from "@/features/customers/balance";
import { isDeletePasswordValid, getDeletePasswordError } from "@/lib/delete-guard";
import { getDictionary } from "@/i18n/server";
import { getAvailableStockIssue, validateAvailableStock } from "@/lib/stock-validation";
import type {
  InvoiceLanguage,
  PaymentMethod,
  BalanceChangeReason,
  Prisma,
} from "@/generated/prisma/client";

type ActionResult = { error?: string; success?: boolean };

export async function checkInvoiceStockAvailability(
  items: Array<{ productId?: string | null; quantity: number }>,
  invoiceId?: string,
) {
  if (!(await hasPermission("INVOICES_MANAGE"))) return null;
  const existingItems = invoiceId
    ? await prisma.invoiceItem.findMany({
        where: { invoiceId },
        select: { productId: true, quantity: true },
      })
    : [];
  return getAvailableStockIssue(items, existingItems);
}

function generateInvoiceNumber() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `INV-${random}`;
}

function computeTotal(items: { quantity: number; unitPrice: number }[]) {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

function balanceEffectReason(delta: number): BalanceChangeReason {
  return delta < 0 ? "BALANCE_USED" : "OVERPAYMENT_CREDIT";
}

/** Client-callable wrapper — invoice creation forms need this to offer
 * distributing an overpayment across a customer's other outstanding
 * invoices before the new invoice even exists yet. */
export async function fetchCustomerOutstandingInvoices(customerId: string) {
  if (!(await hasPermission("INVOICES_MANAGE"))) return [];
  const invoices = await getCustomerOutstandingInvoices(customerId);
  // Server action return values cross the same serialization boundary as
  // RSC props — Decimal instances aren't plain objects, so they have to be
  // converted here rather than left for the caller to convert after the
  // fact.
  return invoices.map((invoice) => ({
    ...invoice,
    total: Number(invoice.total),
    paidAmount: Number(invoice.paidAmount),
  }));
}

export async function createInvoice(
  input: unknown,
  options?: {
    excessToBalance?: boolean;
    /** Stamped on this invoice's own payment rows so the print page can
     * later find other invoices settled in the same session (e.g. when the
     * overpayment on this new invoice was distributed to older ones via
     * recordPaymentAcrossInvoices under the same batch). */
    batchId?: string;
    allowNegativeStock?: boolean;
  },
): Promise<ActionResult> {
  const access = await requirePermission("INVOICES_MANAGE");
  if (!access.ok) return { error: access.error };
  const t = await getDictionary();

  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) return { error: t.invoices.validationError };

  if (!options?.allowNegativeStock) {
    const stockError = await validateAvailableStock(parsed.data.items);
    if (stockError) return { error: stockError };
  }

  const total = computeTotal(parsed.data.items);
  const payments = parsed.data.payments.filter((line) => line.amount > 0);
  const paidAmount = payments.reduce((sum, line) => sum + line.amount, 0);
  const paymentStatus = computePaymentStatus(total, paidAmount);
  const primaryMethod = payments[0]?.method ?? "CASH";
  const customerId = parsed.data.customerId;
  // computeBalanceEffect nets a من الرصيد draw against any overpayment past
  // the total. When that nets out positive, it's new credit rather than a
  // draw — only apply that portion if the admin explicitly opted in;
  // otherwise cap it at 0 so paying more than the total never silently
  // grows رصيد on its own.
  const rawBalanceEffect = computeBalanceEffect(total, payments);
  const balanceEffect =
    rawBalanceEffect > 0.005 && !options?.excessToBalance
      ? 0
      : rawBalanceEffect;

  let invoiceId: string;
  try {
    invoiceId = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          invoiceNumber: generateInvoiceNumber(),
          language: parsed.data.language,
          customerId,
          customerName: parsed.data.customerName,
          customerPhone: parsed.data.customerPhone,
          customerEmail: parsed.data.customerEmail || null,
          notes: parsed.data.notes || null,
          orderId: parsed.data.orderId || null,
          total,
          paymentMethod: primaryMethod,
          paymentStatus,
          paidAmount,
          balanceEffectApplied: balanceEffect,
          createdById: access.adminId,
          items: {
            create: parsed.data.items.map((item, index) => ({
              productId: item.productId || null,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              position: index + 1,
            })),
          },
        },
      });

      if (payments.length > 0) {
        await tx.payment.createMany({
          data: payments.map((line) => ({
            invoiceId: created.id,
            amount: line.amount,
            method: line.method,
            batchId: options?.batchId,
          })),
        });
      }

      const stockItems = parsed.data.items.filter((item) => item.productId);
      for (const item of stockItems) {
        if (options?.allowNegativeStock) {
          await tx.product.update({
            where: { id: item.productId! },
            data: { quantity: { decrement: item.quantity } },
          });
        } else {
          const updated = await tx.product.updateMany({
            where: { id: item.productId!, quantity: { gte: item.quantity } },
            data: { quantity: { decrement: item.quantity } },
          });
          if (updated.count !== 1) throw new Error("INSUFFICIENT_STOCK");
        }
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId!,
            type: "OUT",
            quantity: item.quantity,
            reason: `فاتورة رقم ${created.invoiceNumber}`,
            reference: created.id,
          },
        });
      }

      await adjustCustomerBalance(tx, customerId, balanceEffect, {
        reason: balanceEffectReason(balanceEffect),
        invoiceId: created.id,
        invoiceNumber: created.invoiceNumber,
      });

      return created.id;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
      const stockError = await validateAvailableStock(parsed.data.items);
      return { error: stockError ?? t.invoices.insufficientStockFallbackError };
    }
    return { error: t.invoices.createError };
  }

  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/customers/${customerId}`);
  redirect(`/dashboard/invoices/${invoiceId}`);
}

export async function updateInvoice(
  id: string,
  input: unknown,
  options?: { allowNegativeStock?: boolean },
): Promise<ActionResult> {
  const access = await requirePermission("INVOICES_MANAGE");
  if (!access.ok) return { error: access.error };
  const t = await getDictionary();

  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) return { error: t.invoices.validationError };

  const existing = await prisma.invoice.findUnique({
    where: { id },
    include: { payments: true, items: true },
  });
  if (!existing) return { error: t.invoices.notFoundError };

  if (!options?.allowNegativeStock) {
    const stockError = await validateAvailableStock(parsed.data.items, existing.items);
    if (stockError) return { error: stockError };
  }

  const total = computeTotal(parsed.data.items);
  // Items/total edits never touch the payments already on file — رصيد only
  // ever moves because of من الرصيد or an over/under-paid total, both
  // captured by re-deriving the effect against the (unchanged) payments.
  const paidAmount = Number(existing.paidAmount);
  const paymentStatus = computePaymentStatus(total, paidAmount);
  const newBalanceEffect = computeBalanceEffect(
    total,
    existing.payments.map((p) => ({ amount: Number(p.amount), method: p.method })),
  );
  const previousBalanceEffect = Number(existing.balanceEffectApplied);
  const newCustomerId = parsed.data.customerId;

  // Stock was reserved per-product when this invoice was first created;
  // editing its items must move that reservation by the exact delta, or the
  // product's on-hand quantity (and everything derived from it — low-stock
  // count, total inventory value, movement history) silently drifts out of
  // sync with what the invoice actually says was sold.
  const existingQtyByProduct = new Map<string, number>();
  for (const item of existing.items) {
    if (!item.productId) continue;
    existingQtyByProduct.set(
      item.productId,
      (existingQtyByProduct.get(item.productId) ?? 0) + item.quantity,
    );
  }
  const newQtyByProduct = new Map<string, number>();
  for (const item of parsed.data.items) {
    if (!item.productId) continue;
    newQtyByProduct.set(
      item.productId,
      (newQtyByProduct.get(item.productId) ?? 0) + item.quantity,
    );
  }
  const affectedProductIds = new Set([
    ...existingQtyByProduct.keys(),
    ...newQtyByProduct.keys(),
  ]);
  const stockDeltas = [...affectedProductIds]
    .map((productId) => ({
      productId,
      delta:
        (newQtyByProduct.get(productId) ?? 0) -
        (existingQtyByProduct.get(productId) ?? 0),
    }))
    .filter((row) => row.delta !== 0);

  try {
    await prisma.$transaction(async (tx) => {
      for (const { productId, delta } of stockDeltas) {
        if (delta > 0) {
          // More of this product is on the invoice now — reserve the extra
          // stock, same as a fresh sale of that quantity.
          if (options?.allowNegativeStock) {
            await tx.product.update({
              where: { id: productId },
              data: { quantity: { decrement: delta } },
            });
          } else {
            const updated = await tx.product.updateMany({
              where: { id: productId, quantity: { gte: delta } },
              data: { quantity: { decrement: delta } },
            });
            if (updated.count !== 1) throw new Error("INSUFFICIENT_STOCK");
          }
          await tx.inventoryMovement.create({
            data: {
              productId,
              type: "OUT",
              quantity: delta,
              reason: `تعديل فاتورة رقم ${existing.invoiceNumber}`,
              reference: id,
            },
          });
        } else {
          const restored = -delta;
          await tx.product.update({
            where: { id: productId },
            data: { quantity: { increment: restored } },
          });
          await tx.inventoryMovement.create({
            data: {
              productId,
              type: "IN",
              quantity: restored,
              reason: `تعديل فاتورة رقم ${existing.invoiceNumber}`,
              reference: id,
            },
          });
        }
      }

      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.update({
        where: { id },
        data: {
          language: parsed.data.language,
          customerId: newCustomerId,
          customerName: parsed.data.customerName,
          customerPhone: parsed.data.customerPhone,
          customerEmail: parsed.data.customerEmail || null,
          notes: parsed.data.notes || null,
          total,
          paidAmount,
          paymentStatus,
          balanceEffectApplied: newBalanceEffect,
          items: {
            create: parsed.data.items.map((item, index) => ({
              productId: item.productId || null,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              position: index + 1,
            })),
          },
        },
      });

      if (existing.customerId === newCustomerId) {
        if (existing.customerId) {
          const delta = newBalanceEffect - previousBalanceEffect;
          await adjustCustomerBalance(tx, existing.customerId, delta, {
            reason: "INVOICE_EDIT",
            invoiceId: id,
            invoiceNumber: existing.invoiceNumber,
          });
        }
      } else {
        // Reassigned to a different customer: fully reverse the effect on
        // the old customer, then apply it fresh to the new one.
        if (existing.customerId) {
          await adjustCustomerBalance(tx, existing.customerId, -previousBalanceEffect, {
            reason: "INVOICE_EDIT",
            invoiceId: id,
            invoiceNumber: existing.invoiceNumber,
          });
        }
        await adjustCustomerBalance(tx, newCustomerId, newBalanceEffect, {
          reason: "INVOICE_EDIT",
          invoiceId: id,
          invoiceNumber: existing.invoiceNumber,
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_STOCK") {
      const stockError = await validateAvailableStock(parsed.data.items, existing.items);
      return { error: stockError ?? t.invoices.insufficientStockFallbackError };
    }
    return { error: t.invoices.updateError };
  }

  revalidatePath("/dashboard/invoices");
  revalidatePath(`/dashboard/invoices/${id}`);
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard");
  if (existing.customerId) revalidatePath(`/dashboard/customers/${existing.customerId}`);
  if (newCustomerId !== existing.customerId) {
    revalidatePath(`/dashboard/customers/${newCustomerId}`);
  }
  return { success: true };
}

/**
 * Deleting an invoice can undo whatever lifetime effect it had on its
 * customer's رصيد — a من الرصيد draw (negative) or leftover overpayment
 * credit (positive) — but only if the admin explicitly opts in via
 * `applyBalanceChange`. Leaving it unset/false never touches رصيد and
 * never writes a history entry, regardless of which direction it would go.
 */
async function reverseInvoiceBalanceOnDelete(
  tx: Prisma.TransactionClient,
  invoice: {
    id: string;
    invoiceNumber: string;
    customerId: string | null;
    balanceEffectApplied: unknown;
  },
  applyBalanceChange?: boolean,
) {
  if (!invoice.customerId) return;

  const effect = Number(invoice.balanceEffectApplied);
  if (Math.abs(effect) <= 0.005 || !applyBalanceChange) return;

  const change = -effect;
  await adjustCustomerBalance(tx, invoice.customerId, change, {
    reason: change > 0 ? "BALANCE_RETURNED" : "INVOICE_CANCELLATION",
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
  });
}

export async function deleteInvoice(
  id: string,
  options?: { applyBalanceChange?: boolean; password?: string },
): Promise<ActionResult> {
  const access = await requirePermission("INVOICES_MANAGE");
  if (!access.ok) return { error: access.error };
  const t = await getDictionary();
  if (!isDeletePasswordValid(options?.password)) {
    return { error: await getDeletePasswordError() };
  }

  const existing = await prisma.invoice.findUnique({ where: { id } });
  if (!existing) return { error: t.invoices.notFoundError };

  try {
    await prisma.$transaction(async (tx) => {
      await reverseInvoiceBalanceOnDelete(tx, existing, options?.applyBalanceChange);
      await tx.invoice.delete({ where: { id } });
    });
  } catch {
    return { error: t.invoices.deleteError };
  }

  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard");
  if (existing.customerId) revalidatePath(`/dashboard/customers/${existing.customerId}`);
  return { success: true };
}

export async function deleteInvoices(
  decisions: { id: string; applyBalanceChange?: boolean }[],
  password?: string,
): Promise<ActionResult> {
  const access = await requirePermission("INVOICES_MANAGE");
  if (!access.ok) return { error: access.error };
  const t = await getDictionary();
  if (decisions.length === 0) return { success: true };
  if (!isDeletePasswordValid(password)) return { error: await getDeletePasswordError() };

  const decisionById = new Map(decisions.map((d) => [d.id, d.applyBalanceChange]));
  const ids = decisions.map((d) => d.id);

  try {
    await prisma.$transaction(async (tx) => {
      const invoices = await tx.invoice.findMany({ where: { id: { in: ids } } });

      for (const invoice of invoices) {
        await reverseInvoiceBalanceOnDelete(tx, invoice, decisionById.get(invoice.id));
      }

      await tx.invoice.deleteMany({ where: { id: { in: ids } } });
    });
  } catch {
    return { error: t.invoices.bulkDeleteError };
  }

  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function getOrCreateInvoiceForOrder(
  orderId: string,
  options: {
    language: InvoiceLanguage;
    payments: { method: PaymentMethod; amount: number }[];
    excessToBalance?: boolean;
  },
): Promise<ActionResult> {
  const access = await requirePermission("INVOICES_MANAGE");
  if (!access.ok) return { error: access.error };
  const t = await getDictionary();

  const existing = await prisma.invoice.findUnique({
    where: { orderId },
  });

  if (existing) {
    redirect(`/dashboard/invoices/${existing.id}`);
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } } },
  });
  if (!order) return { error: t.invoices.orderNotFoundError };

  const payments = options.payments.filter((line) => line.amount > 0);

  if (payments.some((line) => line.method === "BALANCE") && !order.customerId) {
    return { error: t.invoices.noCustomerForBalance };
  }

  const total = Number(order.total);
  const paidAmount = payments.reduce((sum, line) => sum + line.amount, 0);
  const paymentStatus = computePaymentStatus(total, paidAmount);
  const primaryMethod = payments[0]?.method ?? "CASH";
  const rawBalanceEffect = computeBalanceEffect(total, payments);
  const balanceEffect =
    rawBalanceEffect > 0.005 && !options.excessToBalance ? 0 : rawBalanceEffect;

  let invoiceId: string;
  try {
    invoiceId = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          invoiceNumber: generateInvoiceNumber(),
          language: options.language,
          customerId: order.customerId,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerEmail: order.customerEmail,
          orderId: order.id,
          total: order.total,
          paymentMethod: primaryMethod,
          paymentStatus,
          paidAmount,
          balanceEffectApplied: balanceEffect,
          createdById: access.adminId,
          items: {
            create: order.items.map((item, index) => ({
              productId: item.productId,
              name: item.product.name,
              quantity: item.quantity,
              unitPrice: item.price,
              position: index + 1,
            })),
          },
        },
      });

      if (payments.length > 0) {
        await tx.payment.createMany({
          data: payments.map((line) => ({
            invoiceId: created.id,
            amount: line.amount,
            method: line.method,
          })),
        });
      }

      if (order.status !== "COMPLETED") {
        for (const item of order.items) {
          // Stock is no longer a hard gate here — an order can be invoiced
          // even if it oversold, same as this dialog already allows a
          // customer's balance to go negative rather than blocking.
          await tx.product.updateMany({
            where: { id: item.productId },
            data: { quantity: { decrement: item.quantity } },
          });
          await tx.inventoryMovement.create({
            data: {
              productId: item.productId,
              type: "OUT",
              quantity: item.quantity,
              reason: `فاتورة رقم ${created.invoiceNumber}`,
              reference: created.id,
            },
          });
        }
        await tx.order.update({
          where: { id: order.id },
          data: { status: "COMPLETED" },
        });
      }

      if (order.customerId) {
        await adjustCustomerBalance(tx, order.customerId, balanceEffect, {
          reason: balanceEffectReason(balanceEffect),
          invoiceId: created.id,
          invoiceNumber: created.invoiceNumber,
        });
      }

      return created.id;
    });
  } catch {
    return { error: t.invoices.createError };
  }

  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${order.id}`);
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard");
  if (order.customerId) revalidatePath(`/dashboard/customers/${order.customerId}`);
  redirect(`/dashboard/invoices/${invoiceId}`);
}

export async function recordPayment(
  invoiceId: string,
  input: { amount: number; method: PaymentMethod; note?: string },
): Promise<ActionResult> {
  const access = await requirePermission("INVOICES_MANAGE");
  if (!access.ok) return { error: access.error };
  const t = await getDictionary();

  if (!(input.amount > 0)) {
    return { error: t.invoices.invalidAmountError };
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!invoice) return { error: t.invoices.notFoundError };

  if (input.method === "BALANCE" && !invoice.customerId) {
    return { error: t.invoices.noCustomerForBalance };
  }

  const total = Number(invoice.total);
  const newPaidAmount = Number(invoice.paidAmount) + input.amount;
  const paymentStatus = computePaymentStatus(total, newPaidAmount);

  const allPayments = [
    ...invoice.payments.map((p) => ({ amount: Number(p.amount), method: p.method as string })),
    { amount: input.amount, method: input.method as string },
  ];
  const newBalanceEffect = computeBalanceEffect(total, allPayments);
  const previousBalanceEffect = Number(invoice.balanceEffectApplied);
  const delta = newBalanceEffect - previousBalanceEffect;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          invoiceId,
          amount: input.amount,
          method: input.method,
          note: input.note || null,
        },
      });
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newPaidAmount,
          paymentStatus,
          balanceEffectApplied: newBalanceEffect,
        },
      });

      if (invoice.customerId) {
        await adjustCustomerBalance(tx, invoice.customerId, delta, {
          reason: balanceEffectReason(delta),
          invoiceId,
          invoiceNumber: invoice.invoiceNumber,
        });
      }
    });
  } catch {
    return { error: t.invoices.paymentError };
  }

  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard");
  if (invoice.customerId) {
    revalidatePath(`/dashboard/customers/${invoice.customerId}`);
  }
  return { success: true };
}

/**
 * Records one payment against a customer's outstanding invoices, oldest
 * first, capping the normal allocation at each invoice's remaining balance.
 * If the caller accepts an excess as customer credit, that excess is stored
 * on the final Payment row. The invoice's balanceEffectApplied therefore
 * tracks it, allowing payment edits/deletions to reverse the exact credit
 * later instead of leaving an anonymous, orphaned رصيد adjustment.
 */
export async function recordPaymentAcrossInvoices(
  customerId: string,
  input: {
    invoiceIds: string[];
    amount: number;
    method: PaymentMethod;
    note?: string;
    excessToBalance?: boolean;
    /** Lets a BALANCE payment proceed even past the customer's current
     * رصيد (mirrors the existing single-invoice "allow negative" choice). */
    allowNegativeBalance?: boolean;
    /** Reuse an existing batch (e.g. a new invoice's own payments) instead
     * of starting a fresh one — lets two separate action calls still be
     * recognized as "the same payment session" later. */
    batchId?: string;
  },
): Promise<ActionResult & { batchId?: string }> {
  const access = await requirePermission("INVOICES_MANAGE");
  if (!access.ok) return { error: access.error };
  const t = await getDictionary();

  if (!(input.amount > 0)) {
    return { error: t.invoices.invalidAmountError };
  }
  if (input.invoiceIds.length === 0) {
    return { error: t.invoices.selectAtLeastOneInvoice };
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { error: t.invoices.customerNotFoundError };

  const invoices = await prisma.invoice.findMany({
    where: { id: { in: input.invoiceIds }, customerId },
    include: { payments: true },
    orderBy: { createdAt: "asc" },
  });
  if (invoices.length === 0) return { error: t.invoices.selectedInvoicesNotFoundError };

  if (input.method === "BALANCE" && !input.allowNegativeBalance) {
    const customerBalance = Number(customer.balance);
    if (input.amount > customerBalance + 0.005) {
      return { error: t.invoices.insufficientBalanceTitle };
    }
  }

  let amountLeft = input.amount;
  const allocations: { invoice: (typeof invoices)[number]; allocated: number }[] =
    [];
  for (const invoice of invoices) {
    if (amountLeft <= 0.005) break;
    const total = Number(invoice.total);
    const invoiceRemaining = Math.max(0, total - Number(invoice.paidAmount));
    if (invoiceRemaining <= 0.005) continue;
    const allocated = Math.min(invoiceRemaining, amountLeft);
    allocations.push({ invoice, allocated });
    amountLeft -= allocated;
  }

  const excess = Math.max(0, amountLeft);
  // Keep an accepted overpayment attached to a real Payment row instead of
  // creating an anonymous balance credit. This makes later edit/delete
  // operations able to recompute and reverse that credit exactly, even when
  // the customer's current balance is too small (adjustCustomerBalance
  // deliberately permits the resulting negative balance).
  if (allocations.length === 0 && excess > 0.005 && input.excessToBalance) {
    allocations.push({ invoice: invoices[0], allocated: 0 });
  }
  const batchId = input.batchId ?? crypto.randomUUID();

  try {
    await prisma.$transaction(async (tx) => {
      for (const [index, { invoice, allocated }] of allocations.entries()) {
        const creditedExcess =
          input.excessToBalance && index === allocations.length - 1
            ? excess
            : 0;
        const recordedAmount = allocated + creditedExcess;
        if (recordedAmount <= 0.005) continue;

        const total = Number(invoice.total);
        const newPaidAmount = Number(invoice.paidAmount) + recordedAmount;
        const paymentStatus = computePaymentStatus(total, newPaidAmount);

        const allPayments = [
          ...invoice.payments.map((p) => ({
            amount: Number(p.amount),
            method: p.method as string,
          })),
          { amount: recordedAmount, method: input.method as string },
        ];
        const newBalanceEffect = computeBalanceEffect(total, allPayments);
        const previousBalanceEffect = Number(invoice.balanceEffectApplied);
        const delta = newBalanceEffect - previousBalanceEffect;

        await tx.payment.create({
          data: {
            invoiceId: invoice.id,
            amount: recordedAmount,
            method: input.method,
            note:
              creditedExcess > 0.005
                ? [
                    input.note,
                    `Overpayment credited to balance: ${creditedExcess.toFixed(2)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : input.note || null,
            batchId,
          },
        });
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: newPaidAmount,
            paymentStatus,
            balanceEffectApplied: newBalanceEffect,
          },
        });
        await adjustCustomerBalance(tx, customerId, delta, {
          reason: balanceEffectReason(delta),
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
        });
      }

    });
  } catch {
    return { error: t.invoices.paymentError };
  }

  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/customers/${customerId}`);
  for (const { invoice } of allocations) {
    revalidatePath(`/dashboard/invoices/${invoice.id}`);
  }
  return { success: true, batchId };
}

/**
 * Corrects an already-recorded payment's amount/method/note. Recomputes the
 * invoice's paidAmount, paymentStatus, and balanceEffectApplied from scratch
 * against the *other* payments plus this edited one (same derivation
 * recordPayment uses), then applies only the difference from what رصيد
 * previously reflected — exactly the delta-based approach updateInvoice and
 * deleteInvoice already use, so edits/deletes elsewhere keep working off an
 * accurate balanceEffectApplied no matter how many times a payment here is
 * corrected.
 */
export async function updatePayment(
  paymentId: string,
  input: { amount: number; method: PaymentMethod; note?: string },
): Promise<ActionResult> {
  const access = await requirePermission("INVOICES_MANAGE");
  if (!access.ok) return { error: access.error };
  const t = await getDictionary();

  if (!(input.amount > 0)) {
    return { error: t.invoices.invalidAmountError };
  }

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: { include: { payments: true } } },
  });
  if (!payment) return { error: t.invoices.paymentNotFoundError };

  const invoice = payment.invoice;

  if (input.method === "BALANCE" && !invoice.customerId) {
    return { error: t.invoices.noCustomerForBalance };
  }

  const total = Number(invoice.total);
  const otherPayments = invoice.payments.filter((p) => p.id !== paymentId);
  const otherPaidAmount = otherPayments.reduce(
    (sum, p) => sum + Number(p.amount),
    0,
  );
  const newPaidAmount = otherPaidAmount + input.amount;
  const paymentStatus = computePaymentStatus(total, newPaidAmount);

  const allPayments = [
    ...otherPayments.map((p) => ({ amount: Number(p.amount), method: p.method as string })),
    { amount: input.amount, method: input.method as string },
  ];
  const newBalanceEffect = computeBalanceEffect(total, allPayments);
  const previousBalanceEffect = Number(invoice.balanceEffectApplied);
  const delta = newBalanceEffect - previousBalanceEffect;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          amount: input.amount,
          method: input.method,
          note: input.note || null,
        },
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaidAmount,
          paymentStatus,
          balanceEffectApplied: newBalanceEffect,
        },
      });

      if (invoice.customerId) {
        await adjustCustomerBalance(tx, invoice.customerId, delta, {
          reason: "INVOICE_EDIT",
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
        });
      }
    });
  } catch {
    return { error: t.invoices.paymentUpdateError };
  }

  revalidatePath(`/dashboard/invoices/${invoice.id}`);
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard");
  if (invoice.customerId) {
    revalidatePath(`/dashboard/customers/${invoice.customerId}`);
  }
  return { success: true };
}

/**
 * Removes a payment entirely. Recomputes the invoice's paidAmount and
 * paymentStatus from the *remaining* payments only (so a fully-refunded
 * invoice correctly falls back to غير مدفوع, including the zero-total edge
 * case computePaymentStatus already guards), and reverses whatever رصيد
 * effect this payment contributed — same delta-against-balanceEffectApplied
 * approach updatePayment uses, just against an empty slot instead of an
 * edited one.
 */
export async function deletePayment(
  paymentId: string,
  password: string,
): Promise<ActionResult> {
  const access = await requirePermission("INVOICES_MANAGE");
  if (!access.ok) return { error: access.error };
  const t = await getDictionary();
  if (!isDeletePasswordValid(password)) return { error: await getDeletePasswordError() };

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: { include: { payments: true } } },
  });
  if (!payment) return { error: t.invoices.paymentNotFoundError };

  const invoice = payment.invoice;
  const total = Number(invoice.total);
  const otherPayments = invoice.payments.filter((p) => p.id !== paymentId);
  const newPaidAmount = otherPayments.reduce(
    (sum, p) => sum + Number(p.amount),
    0,
  );
  const paymentStatus = computePaymentStatus(total, newPaidAmount);

  const newBalanceEffect = computeBalanceEffect(
    total,
    otherPayments.map((p) => ({
      amount: Number(p.amount),
      method: p.method as string,
    })),
  );
  const previousBalanceEffect = Number(invoice.balanceEffectApplied);
  const delta = newBalanceEffect - previousBalanceEffect;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.payment.delete({ where: { id: paymentId } });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaidAmount,
          paymentStatus,
          balanceEffectApplied: newBalanceEffect,
        },
      });

      if (invoice.customerId) {
        await adjustCustomerBalance(tx, invoice.customerId, delta, {
          reason: "INVOICE_EDIT",
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
        });
      }
    });
  } catch {
    return { error: t.invoices.paymentDeleteError };
  }

  revalidatePath(`/dashboard/invoices/${invoice.id}`);
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard");
  if (invoice.customerId) {
    revalidatePath(`/dashboard/customers/${invoice.customerId}`);
  }
  return { success: true };
}
