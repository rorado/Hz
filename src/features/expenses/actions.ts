"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { expenseSchema } from "@/features/expenses/schema";

type ActionResult = { error?: string; success?: boolean };

export async function createExpense(input: unknown): Promise<ActionResult> {
  const access = await requirePermission("EXPENSES_MANAGE");
  if (!access.ok) return { error: access.error };

  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  await prisma.expense.create({
    data: {
      category: parsed.data.category,
      amount: parsed.data.amount,
      description: parsed.data.description || null,
      date: new Date(parsed.data.date),
    },
  });

  revalidatePath("/dashboard/expenses");
  return { success: true };
}

export async function updateExpense(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const access = await requirePermission("EXPENSES_MANAGE");
  if (!access.ok) return { error: access.error };

  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  await prisma.expense.update({
    where: { id },
    data: {
      category: parsed.data.category,
      amount: parsed.data.amount,
      description: parsed.data.description || null,
      date: new Date(parsed.data.date),
    },
  });

  revalidatePath("/dashboard/expenses");
  return { success: true };
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  const access = await requirePermission("EXPENSES_MANAGE");
  if (!access.ok) return { error: access.error };

  await prisma.expense.delete({ where: { id } });

  revalidatePath("/dashboard/expenses");
  return { success: true };
}

export async function deleteExpenses(ids: string[]): Promise<ActionResult> {
  const access = await requirePermission("EXPENSES_MANAGE");
  if (!access.ok) return { error: access.error };
  if (ids.length === 0) return { success: true };

  await prisma.expense.deleteMany({ where: { id: { in: ids } } });

  revalidatePath("/dashboard/expenses");
  return { success: true };
}
