"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { productSchema } from "@/features/products/schema";
import { destroyCloudinaryAsset } from "@/lib/cloudinary";
import { computePaymentStatus } from "@/lib/money";
import {
  getDeletePasswordError,
  isDeletePasswordValid,
} from "@/lib/delete-guard";
import {
  adjustCustomerBalance,
  computeBalanceEffect,
} from "@/features/customers/balance";
import { getDictionary } from "@/i18n/server";

type ActionResult = { error?: string; success?: boolean };

export async function findProductIdByBarcode(barcode: string) {
  if (!(await hasPermission("PRODUCTS_VIEW"))) return null;

  const normalizedBarcode = barcode.trim();
  if (!normalizedBarcode) return null;

  return prisma.product.findUnique({
    where: { barcode: normalizedBarcode },
    select: { id: true },
  });
}

export async function createProduct(input: unknown): Promise<ActionResult> {
  const access = await requirePermission("PRODUCTS_MANAGE");
  if (!access.ok) return { error: access.error };
  const t = await getDictionary();

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { error: t.products.validationError };

  const { images, ...data } = parsed.data;

  try {
    await prisma.product.create({
      data: {
        ...data,
        barcode: data.barcode || null,
        description: data.description || null,
        brandId: data.brandId || null,
        images: {
          create: images.map((image, index) => ({
            publicId: image.publicId,
            secureUrl: image.secureUrl,
            position: index,
          })),
        },
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { error: t.products.uniqueFieldsError };
    }
    return { error: t.products.createError };
  }

  revalidatePath("/dashboard/products");
  revalidatePath("/products");
  return { success: true };
}

export async function updateProduct(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const access = await requirePermission("PRODUCTS_MANAGE");
  if (!access.ok) return { error: access.error };
  const t = await getDictionary();

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { error: t.products.validationError };

  const { images, ...data } = parsed.data;

  const existingImages = await prisma.productImage.findMany({
    where: { productId: id },
  });
  const keepPublicIds = new Set(images.map((image) => image.publicId));
  const removedImages = existingImages.filter(
    (image) => !keepPublicIds.has(image.publicId),
  );
  const existingPublicIds = new Set(
    existingImages.map((image) => image.publicId),
  );
  const newImages = images.filter(
    (image) => !existingPublicIds.has(image.publicId),
  );
  const keptCount = existingImages.length - removedImages.length;

  try {
    await prisma.$transaction([
      prisma.product.update({
        where: { id },
        data: {
          ...data,
          barcode: data.barcode || null,
          description: data.description || null,
          brandId: data.brandId || null,
        },
      }),
      ...removedImages.map((image) =>
        prisma.productImage.delete({ where: { id: image.id } }),
      ),
      ...newImages.map((image, index) =>
        prisma.productImage.create({
          data: {
            productId: id,
            publicId: image.publicId,
            secureUrl: image.secureUrl,
            position: keptCount + index,
          },
        }),
      ),
    ]);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { error: t.products.uniqueFieldsError };
    }
    return { error: t.products.updateError };
  }

  await Promise.all(
    removedImages.map((image) => destroyCloudinaryAsset(image.publicId)),
  );

  revalidatePath("/dashboard/products");
  revalidatePath("/products");
  revalidatePath(`/products/${parsed.data.slug}`);
  return { success: true };
}

async function forceDeleteProducts(ids: string[]) {
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: { images: true },
  });
  if (products.length === 0) return { deletedCount: 0, images: [] };

  const productIds = products.map((product) => product.id);

  await prisma.$transaction(async (tx) => {
    const [orderItems, purchaseItems, invoiceItems, purchaseReturnItems] =
      await Promise.all([
        tx.orderItem.findMany({
          where: { productId: { in: productIds } },
          select: { id: true, orderId: true },
        }),
        tx.purchaseOrderItem.findMany({
          where: { productId: { in: productIds } },
          select: { id: true, purchaseOrderId: true },
        }),
        tx.invoiceItem.findMany({
          where: { productId: { in: productIds } },
          select: { id: true, invoiceId: true },
        }),
        tx.purchaseReturnItem.findMany({
          where: { productId: { in: productIds } },
          select: { id: true, purchaseReturnId: true },
        }),
      ]);

    const invoiceItemIds = invoiceItems.map((item) => item.id);
    const purchaseItemIds = purchaseItems.map((item) => item.id);
    const salesReturnItems = invoiceItemIds.length
      ? await tx.salesReturnItem.findMany({
          where: { invoiceItemId: { in: invoiceItemIds } },
          select: { id: true, salesReturnId: true },
        })
      : [];
    const linkedPurchaseReturnItems = purchaseItemIds.length
      ? await tx.purchaseReturnItem.findMany({
          where: { purchaseOrderItemId: { in: purchaseItemIds } },
          select: { id: true, purchaseReturnId: true },
        })
      : [];

    const salesReturnIds = [
      ...new Set(salesReturnItems.map((item) => item.salesReturnId)),
    ];
    const purchaseReturnIds = [
      ...new Set(
        [...purchaseReturnItems, ...linkedPurchaseReturnItems].map(
          (item) => item.purchaseReturnId,
        ),
      ),
    ];
    const orderIds = [...new Set(orderItems.map((item) => item.orderId))];
    const purchaseOrderIds = [
      ...new Set(purchaseItems.map((item) => item.purchaseOrderId)),
    ];
    const invoiceIds = [
      ...new Set(invoiceItems.map((item) => item.invoiceId)),
    ];

    await tx.salesReturnItem.deleteMany({
      where: {
        OR: [
          { productId: { in: productIds } },
          ...(invoiceItemIds.length
            ? [{ invoiceItemId: { in: invoiceItemIds } }]
            : []),
        ],
      },
    });
    await tx.purchaseReturnItem.deleteMany({
      where: {
        OR: [
          { productId: { in: productIds } },
          ...(purchaseItemIds.length
            ? [{ purchaseOrderItemId: { in: purchaseItemIds } }]
            : []),
        ],
      },
    });
    await tx.invoiceItem.deleteMany({ where: { productId: { in: productIds } } });
    await tx.purchaseOrderItem.deleteMany({
      where: { productId: { in: productIds } },
    });
    await tx.orderItem.deleteMany({ where: { productId: { in: productIds } } });
    await tx.inventoryMovement.deleteMany({
      where: { productId: { in: productIds } },
    });

    for (const orderId of orderIds) {
      const items = await tx.orderItem.findMany({
        where: { orderId },
        select: { quantity: true, price: true },
      });
      const total = items.reduce(
        (sum, item) => sum + item.quantity * Number(item.price),
        0,
      );
      await tx.order.update({ where: { id: orderId }, data: { total } });
    }

    for (const purchaseOrderId of purchaseOrderIds) {
      const [purchase, items] = await Promise.all([
        tx.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId } }),
        tx.purchaseOrderItem.findMany({
          where: { purchaseOrderId },
          select: { quantity: true, unitCost: true },
        }),
      ]);
      const total = items.reduce(
        (sum, item) => sum + item.quantity * Number(item.unitCost),
        0,
      );
      await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: {
          total,
          paymentStatus: computePaymentStatus(total, Number(purchase.paidAmount)),
        },
      });
    }

    for (const invoiceId of invoiceIds) {
      const [invoice, items] = await Promise.all([
        tx.invoice.findUniqueOrThrow({
          where: { id: invoiceId },
          include: { payments: true },
        }),
        tx.invoiceItem.findMany({
          where: { invoiceId },
          select: { quantity: true, unitPrice: true },
        }),
      ]);
      const total =
        items.reduce(
          (sum, item) => sum + item.quantity * Number(item.unitPrice),
          0,
        ) + Number(invoice.mergedDebtAmount);
      const rawBalanceEffect = computeBalanceEffect(
        total,
        invoice.payments.map((payment) => ({
          amount: Number(payment.amount),
          method: payment.method,
        })),
      );
      const previousBalanceEffect = Number(invoice.balanceEffectApplied);
      const balanceEffect =
        rawBalanceEffect > 0.005 && previousBalanceEffect <= 0.005
          ? 0
          : rawBalanceEffect;

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          total,
          paymentStatus: computePaymentStatus(total, Number(invoice.paidAmount)),
          balanceEffectApplied: balanceEffect,
        },
      });
      if (invoice.customerId) {
        await adjustCustomerBalance(
          tx,
          invoice.customerId,
          balanceEffect - previousBalanceEffect,
          {
            reason: "INVOICE_EDIT",
            invoiceId,
            invoiceNumber: invoice.invoiceNumber,
            note: "Product permanently deleted",
          },
        );
      }
    }

    for (const salesReturnId of salesReturnIds) {
      const items = await tx.salesReturnItem.findMany({
        where: { salesReturnId },
        select: { total: true },
      });
      const subtotal = items.reduce((sum, item) => sum + Number(item.total), 0);
      const current = await tx.salesReturn.findUniqueOrThrow({
        where: { id: salesReturnId },
        select: {
          returnNumber: true,
          customerId: true,
          refundMethod: true,
          refundAmount: true,
        },
      });
      const refundAmount = Math.min(Number(current.refundAmount), subtotal);
      await tx.salesReturn.update({
        where: { id: salesReturnId },
        data: { subtotal, refundAmount },
      });
      if (current.refundMethod === "CUSTOMER_CREDIT" && current.customerId) {
        await adjustCustomerBalance(
          tx,
          current.customerId,
          refundAmount - Number(current.refundAmount),
          {
            reason: "BALANCE_RETURNED",
            note: `Product deleted from sales return ${current.returnNumber}`,
          },
        );
      }
    }

    for (const purchaseReturnId of purchaseReturnIds) {
      const items = await tx.purchaseReturnItem.findMany({
        where: { purchaseReturnId },
        select: { total: true },
      });
      const total = items.reduce((sum, item) => sum + Number(item.total), 0);
      const current = await tx.purchaseReturn.findUniqueOrThrow({
        where: { id: purchaseReturnId },
        select: {
          returnNumber: true,
          purchaseId: true,
          supplierId: true,
          refundMethod: true,
          refundAmount: true,
        },
      });
      const refundAmount = Math.min(Number(current.refundAmount), total);
      await tx.purchaseReturn.update({
        where: { id: purchaseReturnId },
        data: { total, refundAmount },
      });
      if (current.refundMethod === "SUPPLIER_CREDIT") {
        const change = refundAmount - Number(current.refundAmount);
        if (Math.abs(change) > 0.005) {
          const supplier = await tx.supplier.findUniqueOrThrow({
            where: { id: current.supplierId },
            select: { balance: true },
          });
          const previousBalance = Number(supplier.balance);
          const newBalance = previousBalance + change;
          await tx.supplier.update({
            where: { id: current.supplierId },
            data: { balance: newBalance },
          });
          await tx.supplierBalanceHistory.create({
            data: {
              supplierId: current.supplierId,
              purchaseOrderId: current.purchaseId,
              reference: current.returnNumber,
              previousBalance,
              change,
              newBalance,
              reason: "MANUAL_ADJUSTMENT",
              note: "Product permanently deleted from purchase return",
            },
          });
        }
      }
    }

    await tx.product.deleteMany({ where: { id: { in: productIds } } });
  });

  return {
    deletedCount: products.length,
    images: products.flatMap((product) => product.images),
  };
}

export async function deleteProduct(
  id: string,
  password: string,
): Promise<ActionResult> {
  const access = await requirePermission("PRODUCTS_MANAGE");
  if (!access.ok) return { error: access.error };
  if (!isDeletePasswordValid(password)) return { error: await getDeletePasswordError() };
  const t = await getDictionary();

  let deletedImages: Awaited<ReturnType<typeof forceDeleteProducts>>["images"];
  try {
    const result = await forceDeleteProducts([id]);
    if (result.deletedCount === 0) return { error: t.products.notFoundError };
    deletedImages = result.images;
  } catch {
    return { error: t.products.deleteError };
  }
  await Promise.allSettled(
    deletedImages.map((image) => destroyCloudinaryAsset(image.publicId)),
  );

  revalidatePath("/dashboard/products");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/sales-returns");
  revalidatePath("/dashboard/purchase-returns");
  revalidatePath("/dashboard/inventory");
  return { success: true };
}

export async function deleteProducts(
  ids: string[],
  password?: string,
): Promise<ActionResult> {
  const access = await requirePermission("PRODUCTS_MANAGE");
  if (!access.ok) return { error: access.error };
  if (!isDeletePasswordValid(password)) return { error: await getDeletePasswordError() };
  if (ids.length === 0) return { success: true };
  const t = await getDictionary();

  let deletedImages: Awaited<ReturnType<typeof forceDeleteProducts>>["images"];
  try {
    const result = await forceDeleteProducts(ids);
    deletedImages = result.images;
  } catch {
    return { error: t.products.bulkDeleteError };
  }
  await Promise.allSettled(
    deletedImages.map((image) => destroyCloudinaryAsset(image.publicId)),
  );

  revalidatePath("/dashboard/products");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/sales-returns");
  revalidatePath("/dashboard/purchase-returns");
  revalidatePath("/dashboard/inventory");

  return { success: true };
}
