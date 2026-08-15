"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { supplierSchema } from "@/features/suppliers/schema";

type ActionResult = { error?: string; success?: boolean };

export async function adjustSupplierBalance(
  supplierId: string,
  input: { delta: number; note?: string },
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "غير مصرح" };
  if (!Number.isFinite(input.delta) || Math.abs(input.delta) < 0.005) {
    return { error: "أدخل مبلغًا صحيحًا" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: supplierId } });
      const previousBalance = Number(supplier.balance);
      const newBalance = Math.round((previousBalance + input.delta) * 100) / 100;
      if (newBalance < 0) throw new Error("لا يمكن أن يصبح رصيد المورد سالبًا");
      await tx.supplier.update({ where: { id: supplierId }, data: { balance: newBalance } });
      await tx.supplierBalanceHistory.create({ data: {
        supplierId, previousBalance, change: input.delta, newBalance,
        reason: "MANUAL_ADJUSTMENT", note: input.note || null, createdById: session.user.id,
      } });
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "تعذر تعديل الرصيد" };
  }
  revalidatePath(`/dashboard/suppliers/${supplierId}`);
  revalidatePath("/dashboard/suppliers");
  return { success: true };
}

export async function createSupplier(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح" };

  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  await prisma.supplier.create({
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      address: parsed.data.address || null,
    },
  });

  revalidatePath("/dashboard/suppliers");
  return { success: true };
}

export async function updateSupplier(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح" };

  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  await prisma.supplier.update({
    where: { id },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      address: parsed.data.address || null,
    },
  });

  revalidatePath("/dashboard/suppliers");
  return { success: true };
}

export async function deleteSupplier(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح" };

  try {
    await prisma.supplier.delete({ where: { id } });
  } catch {
    return { error: "لا يمكن حذف هذا المورد لارتباطه بأوامر شراء سابقة" };
  }

  revalidatePath("/dashboard/suppliers");
  return { success: true };
}

export async function deleteSuppliers(ids: string[]): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { error: "غير مصرح" };
  if (ids.length === 0) return { success: true };

  let failedCount = 0;
  for (const id of ids) {
    try {
      await prisma.supplier.delete({ where: { id } });
    } catch {
      failedCount++;
    }
  }

  revalidatePath("/dashboard/suppliers");

  if (failedCount > 0) {
    return {
      error: `تعذر حذف ${failedCount} من الموردين لارتباطهم بأوامر شراء سابقة`,
    };
  }
  return { success: true };
}
