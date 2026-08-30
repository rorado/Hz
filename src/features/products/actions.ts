"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { productSchema } from "@/features/products/schema";
import { destroyCloudinaryAsset } from "@/lib/cloudinary";
import {
  getDeletePasswordError,
  isDeletePasswordValid,
} from "@/lib/delete-guard";
import { getDictionary } from "@/i18n/server";
import { formatMessage } from "@/i18n/format";
import type { Dictionary } from "@/i18n/dictionaries";

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
        createdById: access.adminId,
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

type ProductDeletionBlockers = {
  invoiceNumbers: string[];
  orderNumbers: string[];
  purchaseOrderNumbers: string[];
  purchaseReturnNumbers: string[];
};

function hasBlockers(blockers: ProductDeletionBlockers) {
  return (
    blockers.invoiceNumbers.length > 0 ||
    blockers.orderNumbers.length > 0 ||
    blockers.purchaseOrderNumbers.length > 0 ||
    blockers.purchaseReturnNumbers.length > 0
  );
}

/**
 * A product can't be deleted while an invoice, order, purchase order, or
 * purchase return still references it — those are all restrict-on-delete
 * relations at the DB level. Collects exactly what's blocking it, by
 * document number, so the error can tell the admin precisely what to remove
 * or edit first instead of a generic "can't delete" message. Inventory
 * movements and sales returns aren't included here: both point back at the
 * product with a nullable, set-null-on-delete relation, so they never
 * actually block deletion.
 */
async function getProductDeletionBlockers(
  productId: string,
): Promise<ProductDeletionBlockers> {
  const [invoiceItems, orderItems, purchaseItems, purchaseReturnItems] =
    await Promise.all([
      prisma.invoiceItem.findMany({
        where: { productId },
        select: { invoice: { select: { invoiceNumber: true } } },
      }),
      prisma.orderItem.findMany({
        where: { productId },
        select: { order: { select: { orderNumber: true } } },
      }),
      prisma.purchaseOrderItem.findMany({
        where: { productId },
        select: { purchaseOrder: { select: { orderNumber: true } } },
      }),
      prisma.purchaseReturnItem.findMany({
        where: { productId },
        select: { purchaseReturn: { select: { returnNumber: true } } },
      }),
    ]);

  return {
    invoiceNumbers: [
      ...new Set(invoiceItems.map((item) => item.invoice.invoiceNumber)),
    ],
    orderNumbers: [
      ...new Set(orderItems.map((item) => item.order.orderNumber)),
    ],
    purchaseOrderNumbers: [
      ...new Set(purchaseItems.map((item) => item.purchaseOrder.orderNumber)),
    ],
    purchaseReturnNumbers: [
      ...new Set(
        purchaseReturnItems.map((item) => item.purchaseReturn.returnNumber),
      ),
    ],
  };
}

const MAX_LISTED_REFERENCES = 5;

function formatReferenceList(t: Dictionary, numbers: string[]) {
  const shown = numbers.slice(0, MAX_LISTED_REFERENCES);
  const remaining = numbers.length - shown.length;
  const list = shown.join(", ");
  return remaining > 0
    ? `${list} ${formatMessage(t.products.andMoreTemplate, { count: remaining })}`
    : list;
}

function formatDeletionBlockedError(
  t: Dictionary,
  blockers: ProductDeletionBlockers,
) {
  const segments: string[] = [];
  if (blockers.invoiceNumbers.length) {
    segments.push(
      formatMessage(t.products.linkedInvoicesTemplate, {
        list: formatReferenceList(t, blockers.invoiceNumbers),
      }),
    );
  }
  if (blockers.orderNumbers.length) {
    segments.push(
      formatMessage(t.products.linkedOrdersTemplate, {
        list: formatReferenceList(t, blockers.orderNumbers),
      }),
    );
  }
  if (blockers.purchaseOrderNumbers.length) {
    segments.push(
      formatMessage(t.products.linkedPurchaseOrdersTemplate, {
        list: formatReferenceList(t, blockers.purchaseOrderNumbers),
      }),
    );
  }
  if (blockers.purchaseReturnNumbers.length) {
    segments.push(
      formatMessage(t.products.linkedPurchaseReturnsTemplate, {
        list: formatReferenceList(t, blockers.purchaseReturnNumbers),
      }),
    );
  }
  return `${t.products.cannotDeleteLinkedIntro} ${segments.join(" — ")}`;
}

export async function deleteProduct(
  id: string,
  password: string,
): Promise<ActionResult> {
  const access = await requirePermission("PRODUCTS_MANAGE");
  if (!access.ok) return { error: access.error };
  if (!isDeletePasswordValid(password)) return { error: await getDeletePasswordError() };
  const t = await getDictionary();

  const product = await prisma.product.findUnique({
    where: { id },
    include: { images: true },
  });
  if (!product) return { error: t.products.notFoundError };

  const blockers = await getProductDeletionBlockers(id);
  if (hasBlockers(blockers)) {
    return { error: formatDeletionBlockedError(t, blockers) };
  }

  try {
    await prisma.product.delete({ where: { id } });
  } catch {
    return { error: t.products.deleteError };
  }
  await Promise.allSettled(
    product.images.map((image) => destroyCloudinaryAsset(image.publicId)),
  );

  revalidatePath("/dashboard/products");
  revalidatePath("/products");
  revalidatePath("/dashboard");
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

  let failedCount = 0;
  for (const id of ids) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: { images: true },
    });
    if (!product) {
      failedCount++;
      continue;
    }
    const blockers = await getProductDeletionBlockers(id);
    if (hasBlockers(blockers)) {
      failedCount++;
      continue;
    }
    try {
      await prisma.product.delete({ where: { id } });
    } catch {
      failedCount++;
      continue;
    }
    await Promise.allSettled(
      product.images.map((image) => destroyCloudinaryAsset(image.publicId)),
    );
  }

  revalidatePath("/dashboard/products");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");

  if (failedCount > 0) {
    return {
      error: formatMessage(t.products.bulkDeleteErrorTemplate, {
        count: failedCount,
      }),
    };
  }
  return { success: true };
}
