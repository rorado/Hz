"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { productSchema } from "@/features/products/schema";
import { destroyCloudinaryAsset } from "@/lib/cloudinary";

type ActionResult = { error?: string; success?: boolean };

export async function findProductIdByBarcode(barcode: string) {
  const session = await auth();
  if (!session?.user) return null;

  const normalizedBarcode = barcode.trim();
  if (!normalizedBarcode) return null;

  return prisma.product.findUnique({
    where: { barcode: normalizedBarcode },
    select: { id: true },
  });
}

export async function createProduct(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح" };

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

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
      return { error: "SKU أو الرابط أو الباركود مستخدم بالفعل لمنتج آخر" };
    }
    return { error: "حدث خطأ أثناء إضافة المنتج" };
  }

  revalidatePath("/dashboard/products");
  revalidatePath("/products");
  return { success: true };
}

export async function updateProduct(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح" };

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

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
      return { error: "SKU أو الرابط أو الباركود مستخدم بالفعل لمنتج آخر" };
    }
    return { error: "حدث خطأ أثناء تحديث المنتج" };
  }

  await Promise.all(
    removedImages.map((image) => destroyCloudinaryAsset(image.publicId)),
  );

  revalidatePath("/dashboard/products");
  revalidatePath("/products");
  revalidatePath(`/products/${parsed.data.slug}`);
  return { success: true };
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح" };

  const product = await prisma.product.findUnique({
    where: { id },
    include: { images: true },
  });
  if (!product) return { error: "المنتج غير موجود" };

  try {
    await prisma.product.delete({ where: { id } });
  } catch {
    return { error: "لا يمكن حذف هذا المنتج لارتباطه بطلبات أو فواتير سابقة" };
  }

  await Promise.all(
    product.images.map((image) => destroyCloudinaryAsset(image.publicId)),
  );

  revalidatePath("/dashboard/products");
  revalidatePath("/products");
  return { success: true };
}

export async function deleteProducts(ids: string[]): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح" };
  if (ids.length === 0) return { success: true };

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: { images: true },
  });

  let failedCount = 0;
  for (const product of products) {
    try {
      await prisma.product.delete({ where: { id: product.id } });
      await Promise.all(
        product.images.map((image) => destroyCloudinaryAsset(image.publicId)),
      );
    } catch {
      failedCount++;
    }
  }

  revalidatePath("/dashboard/products");
  revalidatePath("/products");

  if (failedCount > 0) {
    return {
      error: `تعذر حذف ${failedCount} من المنتجات لارتباطها بطلبات أو فواتير سابقة`,
    };
  }
  return { success: true };
}
