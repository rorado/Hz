"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  countOtherActiveFullAccessAdmins,
} from "@/lib/permissions";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { isDeletePasswordValid, DELETE_PASSWORD_ERROR } from "@/lib/delete-guard";
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
} from "./schema";

type ActionResult = { error?: string; success?: boolean };

const PASSWORD_HASH_COST = 12;

export async function createUser(input: unknown): Promise<ActionResult> {
  const access = await requirePermission("USERS_MANAGE");
  if (!access.ok) return { error: access.error };

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  try {
    const hashed = await bcrypt.hash(parsed.data.password, PASSWORD_HASH_COST);
    await prisma.admin.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        password: hashed,
        roleId: parsed.data.roleId,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { error: "هذا البريد الإلكتروني مستخدم بالفعل" };
    }
    return { error: "حدث خطأ أثناء إنشاء المستخدم" };
  }

  revalidatePath("/dashboard/settings/users");
  return { success: true };
}

export async function updateUser(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const access = await requirePermission("USERS_MANAGE");
  if (!access.ok) return { error: access.error };

  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  const target = await prisma.admin.findUnique({
    where: { id },
    select: { roleId: true, role: { select: { isFullAccess: true } } },
  });
  if (!target) return { error: "المستخدم غير موجود" };

  // Structural guard against self-escalation: nobody can change their own
  // role, even an admin with USERS_MANAGE — closes the "grant myself more
  // permissions" hole without relying on the UI to hide the control.
  if (id === access.adminId && parsed.data.roleId !== target.roleId) {
    return { error: "لا يمكنك تغيير دورك الخاص" };
  }

  const newRole = await prisma.role.findUnique({
    where: { id: parsed.data.roleId },
    select: { isFullAccess: true },
  });
  if (!newRole) return { error: "الدور المحدد غير موجود" };

  if (target.role.isFullAccess && !newRole.isFullAccess) {
    const others = await countOtherActiveFullAccessAdmins(id);
    if (others === 0) {
      return { error: "لا يمكن إزالة صلاحية آخر مدير في النظام" };
    }
  }

  try {
    await prisma.admin.update({
      where: { id },
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        roleId: parsed.data.roleId,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { error: "هذا البريد الإلكتروني مستخدم بالفعل" };
    }
    return { error: "حدث خطأ أثناء تحديث المستخدم" };
  }

  revalidatePath("/dashboard/settings/users");
  return { success: true };
}

export async function resetUserPassword(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const access = await requirePermission("USERS_MANAGE");
  if (!access.ok) return { error: access.error };

  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  const hashed = await bcrypt.hash(parsed.data.password, PASSWORD_HASH_COST);
  await prisma.admin.update({ where: { id }, data: { password: hashed } });

  revalidatePath("/dashboard/settings/users");
  return { success: true };
}

export async function toggleUserActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const access = await requirePermission("USERS_MANAGE");
  if (!access.ok) return { error: access.error };

  if (!isActive) {
    if (id === access.adminId) {
      return { error: "لا يمكنك إلغاء تفعيل حسابك الخاص" };
    }
    const target = await prisma.admin.findUnique({
      where: { id },
      select: { role: { select: { isFullAccess: true } } },
    });
    if (target?.role.isFullAccess) {
      const others = await countOtherActiveFullAccessAdmins(id);
      if (others === 0) {
        return { error: "لا يمكن إلغاء تفعيل آخر مدير في النظام" };
      }
    }
  }

  await prisma.admin.update({ where: { id }, data: { isActive } });
  revalidatePath("/dashboard/settings/users");
  return { success: true };
}

async function guardUserDeletion(
  id: string,
  currentAdminId: string,
): Promise<ActionResult | null> {
  if (id === currentAdminId) return { error: "لا يمكنك حذف حسابك الخاص" };

  const target = await prisma.admin.findUnique({
    where: { id },
    select: { role: { select: { isFullAccess: true } } },
  });
  if (!target) return { error: "المستخدم غير موجود" };
  if (target.role.isFullAccess) {
    const others = await countOtherActiveFullAccessAdmins(id);
    if (others === 0) return { error: "لا يمكن حذف آخر مدير في النظام" };
  }
  return null;
}

export async function deleteUser(
  id: string,
  password: string,
): Promise<ActionResult> {
  const access = await requirePermission("USERS_MANAGE");
  if (!access.ok) return { error: access.error };
  if (!isDeletePasswordValid(password)) return { error: DELETE_PASSWORD_ERROR };

  const blocked = await guardUserDeletion(id, access.adminId);
  if (blocked) return blocked;

  try {
    await prisma.admin.delete({ where: { id } });
  } catch {
    return { error: "لا يمكن حذف هذا المستخدم لارتباطه بعمليات سابقة" };
  }

  revalidatePath("/dashboard/settings/users");
  return { success: true };
}

export async function deleteUsers(
  ids: string[],
  password?: string,
): Promise<ActionResult> {
  const access = await requirePermission("USERS_MANAGE");
  if (!access.ok) return { error: access.error };
  if (ids.length === 0) return { success: true };
  if (!isDeletePasswordValid(password)) return { error: DELETE_PASSWORD_ERROR };

  let failedCount = 0;
  for (const id of ids) {
    const blocked = await guardUserDeletion(id, access.adminId);
    if (blocked) {
      failedCount++;
      continue;
    }
    try {
      await prisma.admin.delete({ where: { id } });
    } catch {
      failedCount++;
    }
  }

  revalidatePath("/dashboard/settings/users");

  if (failedCount > 0) {
    return { error: `تعذر حذف ${failedCount} من المستخدمين` };
  }
  return { success: true };
}
