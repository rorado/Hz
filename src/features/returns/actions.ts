"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { salesReturnSchema, purchaseReturnSchema } from "./schema";
import type { Prisma } from "@/generated/prisma/client";
import { getDictionary } from "@/i18n/server";
import { formatMessage } from "@/i18n/format";

type Result = { success?: boolean; id?: string; error?: string };
const cents = (value: number) => Math.round(value * 100) / 100;

export async function searchReturnSources(
  kind: "sales" | "purchase",
  rawQuery: string,
) {
  if (!(await hasPermission("RETURNS_MANAGE"))) return [];
  const query = rawQuery.trim();
  if (!query) return [];

  if (kind === "sales") {
    const rows = await prisma.invoice.findMany({
      where: {
        OR: [
          { invoiceNumber: { contains: query, mode: "insensitive" } },
          { customerName: { contains: query, mode: "insensitive" } },
          { customerPhone: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, invoiceNumber: true, customerName: true },
    });
    return rows.map((row) => ({
      id: row.id,
      number: row.invoiceNumber,
      party: row.customerName,
    }));
  }

  const rows = await prisma.purchaseOrder.findMany({
    where: {
      status: "RECEIVED",
      OR: [
        { orderNumber: { contains: query, mode: "insensitive" } },
        { supplier: { name: { contains: query, mode: "insensitive" } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, orderNumber: true, supplier: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    number: row.orderNumber,
    party: row.supplier.name,
  }));
}

async function nextReturnNumber(
  tx: Prisma.TransactionClient,
  kind: "sales" | "purchase",
) {
  // Serialize number allocation inside the current transaction. This keeps
  // SR/PR numbers sequential and unique without relying on database objects
  // that Prisma db push cannot create (such as custom SQL sequences).
  if (kind === "sales") {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(735001)::text AS locked`;
    const latest = await tx.salesReturn.findFirst({
      orderBy: { returnNumber: "desc" },
      select: { returnNumber: true },
    });
    const next = (Number(latest?.returnNumber.slice(3)) || 0) + 1;
    return `SR-${String(next).padStart(6, "0")}`;
  }

  await tx.$queryRaw`SELECT pg_advisory_xact_lock(735002)::text AS locked`;
  const latest = await tx.purchaseReturn.findFirst({
    orderBy: { returnNumber: "desc" },
    select: { returnNumber: true },
  });
  const next = (Number(latest?.returnNumber.slice(3)) || 0) + 1;
  return `PR-${String(next).padStart(6, "0")}`;
}

function returnActionError(error: unknown, fallback: string, safeMessages: string[]) {
  if (!(error instanceof Error)) return fallback;
  return safeMessages.includes(error.message) ? error.message : fallback;
}

export async function createSalesReturn(input: unknown): Promise<Result> {
  const [session,t] = await Promise.all([auth(),getDictionary()]);
  if (!session?.user?.id) return { error: t.returns.unauthorized };
  const access = await requirePermission("RETURNS_MANAGE");
  if (!access.ok) return { error: access.error };
  const parsed = salesReturnSchema.safeParse(input);
  if (!parsed.success) return { error: t.returns.invalidData };

  try {
    const createdById = session.user.id;
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: parsed.data.invoiceId },
        include: { items: { include: { returnItems: { where: { salesReturn: { status: "CONFIRMED" } } } } } },
      });
      if (!invoice) throw new Error(t.returns.invoiceNotFound);

      const requested = new Map(parsed.data.items.map((item) => [item.invoiceItemId, item]));
      let subtotal = 0;
      const rows = invoice.items.filter((item) => requested.has(item.id)).map((item) => {
        const request = requested.get(item.id)!;
        const returned = item.returnItems.reduce((sum, row) => sum + row.quantity, 0);
        if (request.quantity > item.quantity - returned) throw new Error(formatMessage(t.returns.quantityExceedsTemplate,{product:item.name,requested:request.quantity,sold:item.quantity,returned,available:item.quantity-returned}));
        const total = cents(request.quantity * Number(item.unitPrice));
        subtotal += total;
        return { item, request, total };
      });
      if (rows.length !== requested.size) throw new Error(t.returns.invalidInvoiceItem);
      subtotal = cents(subtotal);
      if (parsed.data.refundAmount > subtotal + 0.005) throw new Error(t.returns.refundExceedsValue);

      const returnNumber = await nextReturnNumber(tx, "sales");
      const noRefund = parsed.data.refundMethod === "NO_IMMEDIATE_REFUND";
      const credited = parsed.data.refundMethod === "CUSTOMER_CREDIT";
      const created = await tx.salesReturn.create({
        data: {
          returnNumber, invoiceId: invoice.id, customerId: invoice.customerId,
          reason: parsed.data.reason, notes: parsed.data.notes || null, subtotal,
          refundAmount: parsed.data.refundAmount, refundMethod: parsed.data.refundMethod,
          refundStatus: noRefund ? "PENDING" : credited ? "CREDITED" : "COMPLETED",
          refundDate: noRefund ? null : new Date(), createdById,
          items: { create: rows.map(({ item, request, total }) => ({
            invoiceItemId: item.id, productId: item.productId, quantity: request.quantity,
            unitPrice: item.unitPrice, total, condition: request.condition,
            restock: request.condition === "GOOD" && Boolean(item.productId),
          })) },
        },
      });

      for (const { item, request } of rows) {
        if (!item.productId) continue;
        const productUpdate = request.condition === "GOOD"
          ? { quantity: { increment: request.quantity } }
          : request.condition === "DAMAGED"
            ? { damagedQuantity: { increment: request.quantity } }
            : { defectiveQuantity: { increment: request.quantity } };
        await tx.product.update({ where: { id: item.productId }, data: productUpdate });
        await tx.inventoryMovement.create({ data: {
          productId: item.productId, type: "SALE_RETURN", quantity: request.quantity,
          reference: returnNumber,
          reason: `${parsed.data.reason} | ${t.returns.conditionAudit}: ${request.condition} | ${t.returns.employeeAudit}: ${session.user.name ?? session.user.email ?? session.user.id}`,
        } });
      }
      if (credited && invoice.customerId && parsed.data.refundAmount > 0) {
        const customer = await tx.customer.findUniqueOrThrow({ where: { id: invoice.customerId } });
        const previous = Number(customer.balance);
        await tx.customer.update({ where: { id: customer.id }, data: { balance: { increment: parsed.data.refundAmount } } });
        await tx.customerBalanceHistory.create({ data: {
          customerId: customer.id, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber,
          previousBalance: previous, change: parsed.data.refundAmount,
          newBalance: cents(previous + parsed.data.refundAmount), reason: "BALANCE_RETURNED",
          note: formatMessage(t.returns.customerCreditNote,{number:returnNumber}),
        } });
      }
      return created;
    });
    revalidatePath("/dashboard/sales-returns");
    revalidatePath(`/dashboard/invoices/${parsed.data.invoiceId}`);
    revalidatePath("/dashboard/inventory");
    return { success: true, id: result.id };
  } catch (error) {
    const safe=[t.returns.invoiceNotFound,t.returns.invalidInvoiceItem,t.returns.refundExceedsValue];
    const quantityPrefix=t.returns.quantityExceedsTemplate.split("{requested}")[0];
    if(error instanceof Error && error.message.startsWith(quantityPrefix)) safe.push(error.message);
    return { error: returnActionError(error, t.returns.createSalesError,safe) };
  }
}

export async function createPurchaseReturn(input: unknown): Promise<Result> {
  const [session,t] = await Promise.all([auth(),getDictionary()]);
  if (!session?.user?.id) return { error: t.returns.unauthorized };
  const access = await requirePermission("RETURNS_MANAGE");
  if (!access.ok) return { error: access.error };
  const parsed = purchaseReturnSchema.safeParse(input);
  if (!parsed.success) return { error: t.returns.invalidData };
  try {
    const createdById = session.user.id;
    const result = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchaseOrder.findUnique({
        where: { id: parsed.data.purchaseId },
        include: { items: { include: { returnItems: { where: { purchaseReturn: { status: "CONFIRMED" } } }, product: true } } },
      });
      if (!purchase) throw new Error(t.returns.purchaseNotFound);
      if (purchase.status !== "RECEIVED") throw new Error(t.returns.receivedOnly);
      const requested = new Map(parsed.data.items.map((item) => [item.purchaseOrderItemId, item]));
      let total = 0;
      const rows = purchase.items.filter((item) => requested.has(item.id)).map((item) => {
        const request = requested.get(item.id)!;
        const returned = item.returnItems.reduce((sum, row) => sum + row.quantity, 0);
        if (request.quantity > item.quantity - returned) throw new Error(formatMessage(t.returns.quantityExceedsTemplate,{product:item.product.name,requested:request.quantity,sold:item.quantity,returned,available:item.quantity-returned}));
        if (request.quantity > item.product.quantity) throw new Error(formatMessage(t.returns.stockInsufficientTemplate,{product:item.product.name}));
        const rowTotal = cents(request.quantity * Number(item.unitCost)); total += rowTotal;
        return { item, request, total: rowTotal };
      });
      if (rows.length !== requested.size) throw new Error(t.returns.invalidPurchaseItem);
      total = cents(total);
      if (parsed.data.refundAmount > total + 0.005) throw new Error(t.returns.refundExceedsValue);
      const returnNumber = await nextReturnNumber(tx, "purchase");
      const noRefund = parsed.data.refundMethod === "NO_IMMEDIATE_REFUND";
      const credited = parsed.data.refundMethod === "SUPPLIER_CREDIT";
      const created = await tx.purchaseReturn.create({ data: {
        returnNumber, purchaseId: purchase.id, supplierId: purchase.supplierId,
        reason: parsed.data.reason, notes: parsed.data.notes || null, total,
        refundAmount: parsed.data.refundAmount, refundMethod: parsed.data.refundMethod,
        refundStatus: noRefund ? "PENDING" : credited ? "CREDITED" : "COMPLETED",
        refundDate: noRefund ? null : new Date(), createdById,
        items: { create: rows.map(({ item, request, total: rowTotal }) => ({
          purchaseOrderItemId: item.id, productId: item.productId, quantity: request.quantity,
          unitCost: item.unitCost, total: rowTotal, reason: request.reason || null,
        })) },
      } });
      if (credited && parsed.data.refundAmount > 0) {
        const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: purchase.supplierId } });
        const previousBalance = Number(supplier.balance);
        await tx.supplier.update({ where: { id: supplier.id }, data: { balance: { increment: parsed.data.refundAmount } } });
        await tx.supplierBalanceHistory.create({ data: {
          supplierId: supplier.id, purchaseOrderId: purchase.id, reference: returnNumber,
          previousBalance, change: parsed.data.refundAmount,
          newBalance: cents(previousBalance + parsed.data.refundAmount), reason: "PURCHASE_RETURN_CREDIT",
          note: formatMessage(t.returns.supplierCreditNote,{number:returnNumber}), createdById: session.user.id,
        } });
      }
      for (const { item, request } of rows) {
        await tx.product.update({ where: { id: item.productId }, data: { quantity: { decrement: request.quantity } } });
        await tx.inventoryMovement.create({ data: {
          productId: item.productId, type: "PURCHASE_RETURN", quantity: -request.quantity,
          reference: returnNumber,
          reason: `${parsed.data.reason} | ${t.returns.employeeAudit}: ${session.user.name ?? session.user.email ?? session.user.id}`,
        } });
      }
      return created;
    });
    revalidatePath("/dashboard/purchase-returns");
    revalidatePath(`/dashboard/purchases/${parsed.data.purchaseId}`);
    revalidatePath("/dashboard/inventory");
    return { success: true, id: result.id };
  } catch (error) {
    const safe=[t.returns.purchaseNotFound,t.returns.receivedOnly,t.returns.invalidPurchaseItem,t.returns.refundExceedsValue];
    const quantityPrefix=t.returns.quantityExceedsTemplate.split("{requested}")[0];
    const stockPrefix=t.returns.stockInsufficientTemplate.split("{product}")[0];
    if(error instanceof Error && (error.message.startsWith(quantityPrefix) || error.message.startsWith(stockPrefix))) safe.push(error.message);
    return { error: returnActionError(error, t.returns.createPurchaseError,safe) };
  }
}
