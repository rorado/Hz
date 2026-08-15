"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { categorySchema } from "@/features/categories/schema";
import { destroyCloudinaryAsset } from "@/lib/cloudinary";

type ActionResult = { error?: string; success?: boolean };

export async function createCategory(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح" };

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  try {
    await prisma.category.create({
      data: {
        name: parsed.data.name,
        slug: parsed.data.slug,
        parentId: parsed.data.parentId || null,
        imagePublicId: parsed.data.image?.publicId ?? null,
        imageSecureUrl: parsed.data.image?.secureUrl ?? null,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { error: "هذا الرابط مستخدم بالفعل لقسم آخر" };
    }
    return { error: "حدث خطأ أثناء إضافة القسم" };
  }

  revalidatePath("/dashboard/categories");
  revalidatePath("/categories");
  revalidatePath("/");
  return { success: true };
}

export async function updateCategory(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح" };

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  if (parsed.data.parentId === id) {
    return { error: "لا يمكن اختيار القسم نفسه كقسم أب" };
  }

  const existing = await prisma.category.findUnique({
    where: { id },
    select: { imagePublicId: true },
  });
  if (!existing) return { error: "القسم غير موجود" };
  const nextPublicId = parsed.data.image?.publicId ?? null;
  const removedPublicId =
    existing.imagePublicId && existing.imagePublicId !== nextPublicId
      ? existing.imagePublicId
      : null;

  try {
    await prisma.category.update({
      where: { id },
      data: {
        name: parsed.data.name,
        slug: parsed.data.slug,
        parentId: parsed.data.parentId || null,
        imagePublicId: parsed.data.image?.publicId ?? null,
        imageSecureUrl: parsed.data.image?.secureUrl ?? null,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { error: "هذا الرابط مستخدم بالفعل لقسم آخر" };
    }
    return { error: "حدث خطأ أثناء تحديث القسم" };
  }

  if (removedPublicId) {
    await Promise.allSettled([destroyCloudinaryAsset(removedPublicId)]);
  }

  revalidatePath("/dashboard/categories");
  revalidatePath("/categories");
  revalidatePath("/");
  return { success: true };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح" };

  const category = await prisma.category.findUnique({
    where: { id },
    select: { imagePublicId: true },
  });
  if (!category) return { error: "القسم غير موجود" };

  try {
    await prisma.category.delete({ where: { id } });
  } catch {
    return {
      error: "لا يمكن حذف هذا القسم لارتباطه بمنتجات أو أقسام فرعية",
    };
  }

  if (category.imagePublicId) {
    await Promise.allSettled([destroyCloudinaryAsset(category.imagePublicId)]);
  }

  revalidatePath("/dashboard/categories");
  return { success: true };
}

export async function deleteCategories(ids: string[]): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح" };
  if (ids.length === 0) return { success: true };

  const categories = await prisma.category.findMany({
    where: { id: { in: ids } },
    select: { id: true, imagePublicId: true },
  });

  let failedCount = 0;
  for (const category of categories) {
    try {
      await prisma.category.delete({ where: { id: category.id } });
      if (category.imagePublicId) {
        await Promise.allSettled([
          destroyCloudinaryAsset(category.imagePublicId),
        ]);
      }
    } catch {
      failedCount++;
    }
  }

  revalidatePath("/dashboard/categories");

  if (failedCount > 0) {
    return {
      error: `تعذر حذف ${failedCount} من الأقسام لارتباطها بمنتجات أو أقسام فرعية`,
    };
  }
  return { success: true };
}
