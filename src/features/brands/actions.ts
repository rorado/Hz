"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { brandSchema } from "@/features/brands/schema";
import { destroyCloudinaryAsset } from "@/lib/cloudinary";

type ActionResult = { error?: string; success?: boolean };

export async function createBrand(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح" };

  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  try {
    await prisma.brand.create({
      data: {
        name: parsed.data.name,
        slug: parsed.data.slug,
        logoUrl: parsed.data.logo?.secureUrl ?? null,
        logoPublicId: parsed.data.logo?.publicId ?? null,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { error: "هذا الرابط مستخدم بالفعل لعلامة تجارية أخرى" };
    }
    return { error: "حدث خطأ أثناء إضافة العلامة التجارية" };
  }

  revalidatePath("/dashboard/brands");
  return { success: true };
}

export async function updateBrand(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح" };

  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  const existing = await prisma.brand.findUnique({
    where: { id },
    select: { logoPublicId: true },
  });
  if (!existing) return { error: "العلامة التجارية غير موجودة" };
  const nextPublicId = parsed.data.logo?.publicId ?? null;
  const removedPublicId =
    existing.logoPublicId && existing.logoPublicId !== nextPublicId
      ? existing.logoPublicId
      : null;

  try {
    await prisma.brand.update({
      where: { id },
      data: {
        name: parsed.data.name,
        slug: parsed.data.slug,
        logoUrl: parsed.data.logo?.secureUrl ?? null,
        logoPublicId: parsed.data.logo?.publicId ?? null,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { error: "هذا الرابط مستخدم بالفعل لعلامة تجارية أخرى" };
    }
    return { error: "حدث خطأ أثناء تحديث العلامة التجارية" };
  }

  if (removedPublicId) {
    await Promise.allSettled([destroyCloudinaryAsset(removedPublicId)]);
  }

  revalidatePath("/dashboard/brands");
  return { success: true };
}

export async function deleteBrand(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح" };

  const brand = await prisma.brand.findUnique({
    where: { id },
    select: { logoPublicId: true },
  });
  if (!brand) return { error: "العلامة التجارية غير موجودة" };

  try {
    await prisma.brand.delete({ where: { id } });
  } catch {
    return { error: "لا يمكن حذف هذه العلامة التجارية لارتباطها بمنتجات" };
  }

  if (brand.logoPublicId) {
    await Promise.allSettled([destroyCloudinaryAsset(brand.logoPublicId)]);
  }

  revalidatePath("/dashboard/brands");
  return { success: true };
}

export async function deleteBrands(ids: string[]): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح" };
  if (ids.length === 0) return { success: true };

  const brands = await prisma.brand.findMany({
    where: { id: { in: ids } },
    select: { id: true, logoPublicId: true },
  });

  let failedCount = 0;
  for (const brand of brands) {
    try {
      await prisma.brand.delete({ where: { id: brand.id } });
      if (brand.logoPublicId) {
        await Promise.allSettled([destroyCloudinaryAsset(brand.logoPublicId)]);
      }
    } catch {
      failedCount++;
    }
  }

  revalidatePath("/dashboard/brands");

  if (failedCount > 0) {
    return {
      error: `تعذر حذف ${failedCount} من العلامات التجارية لارتباطها بمنتجات`,
    };
  }
  return { success: true };
}
