"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { customerSchema } from "@/features/customers/schema";
import { normalizeArabicName } from "@/lib/arabic-name";
import { findCustomerByPhone } from "@/features/customers/queries";
import { adjustCustomerBalance } from "@/features/customers/balance";
import { isDeletePasswordValid, DELETE_PASSWORD_ERROR } from "@/lib/delete-guard";

type ActionResult = { error?: string; success?: boolean };
type CreateCustomerResult = ActionResult & { customerId?: string };

export async function createCustomer(
  input: unknown,
): Promise<CreateCustomerResult> {
  const access = await requirePermission("CUSTOMERS_MANAGE");
  if (!access.ok) return { error: access.error };

  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  const existing = await prisma.customer.findFirst({
    where: { phone: parsed.data.phone },
    select: { id: true },
  });
  if (existing) {
    return { error: "يوجد عميل مسجل بنفس رقم الهاتف بالفعل" };
  }

  const customer = await prisma.customer.create({
    data: {
      name: parsed.data.name,
      nameNormalized: normalizeArabicName(parsed.data.name),
      phone: parsed.data.phone,
      email: parsed.data.email || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
      isFavorite: parsed.data.isFavorite,
    },
  });

  revalidatePath("/dashboard/customers");
  return { success: true, customerId: customer.id };
}

export async function updateCustomer(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const access = await requirePermission("CUSTOMERS_MANAGE");
  if (!access.ok) return { error: access.error };

  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  const existing = await prisma.customer.findFirst({
    where: { phone: parsed.data.phone, id: { not: id } },
    select: { id: true },
  });
  if (existing) {
    return { error: "يوجد عميل مسجل بنفس رقم الهاتف بالفعل" };
  }

  // Invoices and orders each keep their own snapshot of the customer's
  // name/phone/email (so historical documents don't shift if the customer
  // record changes) — but admins expect a plain name correction to show up
  // everywhere that customer is referenced, not just on the Customer record
  // itself, so every one of their invoices/orders gets the same update.
  const customerData = {
    name: parsed.data.name,
    nameNormalized: normalizeArabicName(parsed.data.name),
    phone: parsed.data.phone,
    email: parsed.data.email || null,
    address: parsed.data.address || null,
    notes: parsed.data.notes || null,
    isFavorite: parsed.data.isFavorite,
  };
  const snapshotData = {
    customerName: parsed.data.name,
    customerPhone: parsed.data.phone,
    customerEmail: parsed.data.email || null,
  };

  await prisma.$transaction([
    prisma.customer.update({ where: { id }, data: customerData }),
    prisma.invoice.updateMany({ where: { customerId: id }, data: snapshotData }),
    prisma.order.updateMany({ where: { customerId: id }, data: snapshotData }),
  ]);

  revalidatePath("/dashboard/customers");
  revalidatePath(`/dashboard/customers/${id}`);
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/orders");
  return { success: true };
}

export async function adjustCustomerBalanceManual(
  customerId: string,
  input: { delta: number; note?: string },
): Promise<ActionResult> {
  const access = await requirePermission("CUSTOMERS_MANAGE");
  if (!access.ok) return { error: access.error };

  if (!Number.isFinite(input.delta) || Math.abs(input.delta) < 0.005) {
    return { error: "الرجاء إدخال مبلغ صحيح" };
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return { error: "العميل غير موجود" };

  await prisma.$transaction(async (tx) => {
    await adjustCustomerBalance(tx, customerId, input.delta, {
      reason: "MANUAL_ADJUSTMENT",
      note: input.note,
    });
  });

  revalidatePath(`/dashboard/customers/${customerId}`);
  revalidatePath("/dashboard/customers");
  return { success: true };
}

export async function findCustomerByPhoneAction(
  phone: string,
  excludeId?: string,
) {
  if (!(await hasPermission("CUSTOMERS_MANAGE"))) return [];
  if (phone.trim().length < 6) return [];
  return findCustomerByPhone(phone, excludeId);
}

export async function deleteCustomer(
  id: string,
  password: string,
): Promise<ActionResult> {
  const access = await requirePermission("CUSTOMERS_MANAGE");
  if (!access.ok) return { error: access.error };
  if (!isDeletePasswordValid(password)) return { error: DELETE_PASSWORD_ERROR };

  try {
    await prisma.customer.delete({ where: { id } });
  } catch {
    return { error: "لا يمكن حذف هذا العميل لارتباطه بطلبات سابقة" };
  }

  revalidatePath("/dashboard/customers");
  return { success: true };
}

export async function deleteCustomers(
  ids: string[],
  password?: string,
): Promise<ActionResult> {
  const access = await requirePermission("CUSTOMERS_MANAGE");
  if (!access.ok) return { error: access.error };
  if (ids.length === 0) return { success: true };
  if (!isDeletePasswordValid(password)) return { error: DELETE_PASSWORD_ERROR };

  let failedCount = 0;
  for (const id of ids) {
    try {
      await prisma.customer.delete({ where: { id } });
    } catch {
      failedCount++;
    }
  }

  revalidatePath("/dashboard/customers");

  if (failedCount > 0) {
    return {
      error: `تعذر حذف ${failedCount} من العملاء لارتباطهم بطلبات سابقة`,
    };
  }
  return { success: true };
}

export async function toggleCustomerFavorite(
  id: string,
  isFavorite: boolean,
): Promise<ActionResult> {
  const access = await requirePermission("CUSTOMERS_MANAGE");
  if (!access.ok) return { error: access.error };

  await prisma.customer.update({
    where: { id },
    data: { isFavorite },
  });

  revalidatePath("/dashboard/customers");
  revalidatePath(`/dashboard/customers/${id}`);
  return { success: true };
}
