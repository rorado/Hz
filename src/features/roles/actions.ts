"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { roleSchema } from "./schema";

type ActionResult = { error?: string; success?: boolean };

export async function createRole(input: unknown): Promise<ActionResult> {
  const access = await requirePermission("USERS_MANAGE");
  if (!access.ok) return { error: access.error };

  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  try {
    await prisma.role.create({
      data: {
        name: parsed.data.name,
        isFullAccess: parsed.data.isFullAccess,
        permissions: parsed.data.isFullAccess
          ? undefined
          : {
              create: parsed.data.permissions.map((permission) => ({
                permission,
              })),
            },
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return { error: "اسم الدور مستخدم بالفعل" };
    return { error: "حدث خطأ أثناء إنشاء الدور" };
  }

  revalidatePath("/dashboard/settings/roles");
  return { success: true };
}

export async function updateRole(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const access = await requirePermission("USERS_MANAGE");
  if (!access.ok) return { error: access.error };

  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  const existing = await prisma.role.findUnique({
    where: { id },
    select: { isSystem: true, isFullAccess: true },
  });
  if (!existing) return { error: "الدور غير موجود" };

  // The built-in Admin role's name and full-access flag are locked so the
  // app always keeps at least one un-editable full-access role to fall
  // back on — only its permission set (moot, since isFullAccess bypasses
  // it) would otherwise be editable.
  if (existing.isSystem && (parsed.data.name !== "Admin" || !parsed.data.isFullAccess)) {
    return { error: "لا يمكن تعديل الدور الأساسي للمدير" };
  }

  if (existing.isFullAccess && !parsed.data.isFullAccess) {
    const otherActiveFullAccessAdmins = await prisma.admin.count({
      where: { isActive: true, roleId: { not: id }, role: { isFullAccess: true } },
    });
    if (otherActiveFullAccessAdmins === 0) {
      return {
        error: "لا يمكن إزالة الصلاحية الكاملة من هذا الدور لأنه سيترك النظام بدون مدير مفعل",
      };
    }
  }

  try {
    await prisma.$transaction([
      prisma.role.update({
        where: { id },
        data: { name: parsed.data.name, isFullAccess: parsed.data.isFullAccess },
      }),
      prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      ...(parsed.data.isFullAccess
        ? []
        : [
            prisma.rolePermission.createMany({
              data: parsed.data.permissions.map((permission) => ({
                roleId: id,
                permission,
              })),
            }),
          ]),
    ]);
  } catch (error) {
    if (isUniqueConstraintError(error)) return { error: "اسم الدور مستخدم بالفعل" };
    return { error: "حدث خطأ أثناء تحديث الدور" };
  }

  revalidatePath("/dashboard/settings/roles");
  return { success: true };
}

export async function deleteRole(id: string): Promise<ActionResult> {
  const access = await requirePermission("USERS_MANAGE");
  if (!access.ok) return { error: access.error };

  const role = await prisma.role.findUnique({
    where: { id },
    select: { isSystem: true, _count: { select: { admins: true } } },
  });
  if (!role) return { error: "الدور غير موجود" };
  if (role.isSystem) return { error: "لا يمكن حذف الدور الأساسي للمدير" };
  if (role._count.admins > 0) {
    return { error: "لا يمكن حذف دور مرتبط بمستخدمين" };
  }

  await prisma.role.delete({ where: { id } });
  revalidatePath("/dashboard/settings/roles");
  return { success: true };
}
