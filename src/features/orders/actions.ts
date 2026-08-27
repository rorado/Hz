"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission, hasPermission } from "@/lib/permissions";
import {
  orderItemsSchema,
  reassignOrderCustomerSchema,
  createOrderSchema,
} from "@/features/orders/schema";
import { customerSchema } from "@/features/customers/schema";
import { normalizeArabicName } from "@/lib/arabic-name";
import type { OrderStatus } from "@/generated/prisma/client";
import { validateAvailableStock } from "@/lib/stock-validation";

type ActionResult = { error?: string; success?: boolean };

export type ConflictCustomer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
};

function generateOrderNumber(): string {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

const VALID_STATUSES: OrderStatus[] = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "CANCELLED",
];

export async function updateOrderStatus(
  id: string,
  status: string,
  options?: { allowNegativeStock?: boolean },
): Promise<ActionResult> {
  const access = await requirePermission("ORDERS_MANAGE");
  if (!access.ok) return { error: access.error };

  if (!VALID_STATUSES.includes(status as OrderStatus)) {
    return { error: "حالة غير صحيحة" };
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: { include: { product: true } } },
  });
  if (!order) return { error: "الطلب غير موجود" };

  const completingNow = status === "COMPLETED" && order.status !== "COMPLETED";

  if (completingNow) {
    if (!options?.allowNegativeStock) {
      const stockError = await validateAvailableStock(order.items);
      if (stockError) return { error: stockError };
    }

    await prisma.$transaction([
      prisma.order.update({
        where: { id },
        data: { status: status as OrderStatus },
      }),
      ...order.items.map((item) =>
        prisma.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.quantity } },
        }),
      ),
      ...order.items.map((item) =>
        prisma.inventoryMovement.create({
          data: {
            productId: item.productId,
            type: "OUT",
            quantity: item.quantity,
            reason: `اكتمال الطلب رقم ${order.orderNumber}`,
          },
        }),
      ),
    ]);
  } else {
    await prisma.order.update({
      where: { id },
      data: { status: status as OrderStatus },
    });
  }

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${id}`);
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function getOrderStockIssue(id: string) {
  if (!(await hasPermission("ORDERS_MANAGE"))) return null;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: { include: { product: { select: { name: true, quantity: true } } } } },
  });
  if (!order) return null;
  const totals = new Map<string, number>();
  order.items.forEach((item) => totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity));
  for (const item of order.items) {
    const requested = totals.get(item.productId) ?? 0;
    if (requested > item.product.quantity) {
      return { product: item.product.name, requested, available: item.product.quantity };
    }
  }
  return null;
}

export async function updateOrderItems(
  orderId: string,
  input: unknown,
  options?: { allowNegativeStock?: boolean },
): Promise<ActionResult> {
  const access = await requirePermission("ORDERS_MANAGE");
  if (!access.ok) return { error: access.error };

  const parsed = orderItemsSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  if (!options?.allowNegativeStock) {
    const stockError = await validateAvailableStock(parsed.data.items);
    if (stockError) return { error: stockError };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) return { error: "الطلب غير موجود" };

  const existingIds = new Set(order.items.map((item) => item.id));
  const updates = parsed.data.items.filter(
    (item) => item.id && existingIds.has(item.id),
  );
  const newItems = parsed.data.items.filter((item) => !item.id);

  if (newItems.length > 0) {
    const products = await prisma.product.findMany({
      where: { id: { in: newItems.map((item) => item.productId) } },
    });
    if (products.length !== new Set(newItems.map((item) => item.productId)).size) {
      return { error: "أحد المنتجات المضافة غير موجود" };
    }
  }

  const updatesById = new Map(updates.map((item) => [item.id, item]));
  const total =
    order.items.reduce((sum, item) => {
      const edited = updatesById.get(item.id);
      const price = edited?.price ?? Number(item.price);
      const quantity = edited?.quantity ?? item.quantity;
      return sum + price * quantity;
    }, 0) +
    newItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  await prisma.$transaction([
    ...updates.map((item) =>
      prisma.orderItem.update({
        where: { id: item.id! },
        data: { price: item.price, quantity: item.quantity },
      }),
    ),
    ...(newItems.length > 0
      ? [
          prisma.orderItem.createMany({
            data: newItems.map((item) => ({
              orderId,
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
            })),
          }),
        ]
      : []),
    prisma.order.update({ where: { id: orderId }, data: { total } }),
  ]);

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function reassignOrderCustomer(
  orderId: string,
  input: unknown,
): Promise<ActionResult> {
  const access = await requirePermission("ORDERS_MANAGE");
  if (!access.ok) return { error: access.error };

  const parsed = reassignOrderCustomerSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  const customer = await prisma.customer.findUnique({
    where: { id: parsed.data.customerId },
  });
  if (!customer) return { error: "العميل غير موجود" };

  await prisma.order.update({
    where: { id: orderId },
    data: {
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
    },
  });

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
  return { success: true };
}

/**
 * Saves the customer info attached to an order (creating a customer if the
 * order has none yet, or updating the one it's already linked to), guarding
 * against silently creating a duplicate customer when the submitted phone
 * number already belongs to someone else.
 *
 * On the first call (no `resolution`), a phone match against a *different*
 * customer is returned as `conflict` instead of being saved, so the caller
 * can ask the admin how to proceed, then call again with `resolution`:
 * - "update_existing": overwrite the matched customer's info with the
 *   submitted values and link the order to them.
 * - "keep_existing": leave the matched customer untouched and link the
 *   order to them as-is, discarding the submitted edits.
 * - "force_save": save exactly as if there were no conflict (creates a
 *   separate customer, or updates the order's own linked customer).
 */
export async function saveOrderCustomerInfo(
  orderId: string,
  customerId: string | null,
  input: unknown,
  resolution?: {
    action: "update_existing" | "keep_existing" | "force_save";
    existingCustomerId: string;
  },
): Promise<ActionResult & { conflict?: ConflictCustomer }> {
  const access = await requirePermission("ORDERS_MANAGE");
  if (!access.ok) return { error: access.error };

  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { error: "الطلب غير موجود" };

  if (!resolution) {
    const conflictingCustomer = await prisma.customer.findFirst({
      where: {
        phone: parsed.data.phone,
        ...(customerId ? { id: { not: customerId } } : {}),
      },
    });
    if (conflictingCustomer) {
      return {
        conflict: {
          id: conflictingCustomer.id,
          name: conflictingCustomer.name,
          phone: conflictingCustomer.phone,
          email: conflictingCustomer.email,
          address: conflictingCustomer.address,
          notes: conflictingCustomer.notes,
        },
      };
    }
  }

  const customerData = {
    name: parsed.data.name,
    nameNormalized: normalizeArabicName(parsed.data.name),
    phone: parsed.data.phone,
    email: parsed.data.email || null,
    address: parsed.data.address || null,
    notes: parsed.data.notes || null,
  };

  let targetCustomerId: string;

  if (resolution?.action === "keep_existing") {
    targetCustomerId = resolution.existingCustomerId;
  } else if (resolution?.action === "update_existing") {
    await prisma.customer.update({
      where: { id: resolution.existingCustomerId },
      data: customerData,
    });
    targetCustomerId = resolution.existingCustomerId;
  } else if (customerId) {
    await prisma.customer.update({ where: { id: customerId }, data: customerData });
    targetCustomerId = customerId;
  } else {
    const created = await prisma.customer.create({ data: customerData });
    targetCustomerId = created.id;
  }

  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: targetCustomerId },
  });
  const snapshotData = {
    customerName: customer.name,
    customerPhone: customer.phone,
    customerEmail: customer.email,
  };

  // Orders and invoices each keep their own name/phone/email snapshot, so a
  // correction here needs to be pushed out to every other order and invoice
  // already linked to this customer too — not just the current order.
  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { customerId: customer.id, ...snapshotData },
    }),
    prisma.order.updateMany({
      where: { customerId: customer.id, NOT: { id: orderId } },
      data: snapshotData,
    }),
    prisma.invoice.updateMany({
      where: { customerId: customer.id },
      data: snapshotData,
    }),
  ]);

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/invoices");
  if (customerId) revalidatePath(`/dashboard/customers/${customerId}`);
  revalidatePath(`/dashboard/customers/${customer.id}`);

  return { success: true };
}

export async function createOrder(
  input: unknown,
  options?: { allowNegativeStock?: boolean },
): Promise<ActionResult> {
  const access = await requirePermission("ORDERS_MANAGE");
  if (!access.ok) return { error: access.error };

  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  if (!options?.allowNegativeStock) {
    const stockError = await validateAvailableStock(parsed.data.items);
    if (stockError) return { error: stockError };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: parsed.data.customerId },
  });
  if (!customer) return { error: "العميل غير موجود" };

  const products = await prisma.product.findMany({
    where: { id: { in: parsed.data.items.map((item) => item.productId) } },
  });
  const productById = new Map(products.map((product) => [product.id, product]));

  for (const item of parsed.data.items) {
    const product = productById.get(item.productId);
    if (!product) return { error: "أحد المنتجات غير موجود" };
  }

  const total = parsed.data.items.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0,
  );

  let orderId: string;
  try {
    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        notes: parsed.data.notes || null,
        total,
        items: {
          create: parsed.data.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
          })),
        },
      },
    });
    orderId = order.id;
  } catch {
    return { error: "حدث خطأ أثناء إنشاء الطلب" };
  }

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard");
  redirect(`/dashboard/orders/${orderId}`);
}

export async function deleteOrder(id: string): Promise<ActionResult> {
  const access = await requirePermission("ORDERS_MANAGE");
  if (!access.ok) return { error: access.error };

  try {
    await prisma.order.delete({ where: { id } });
  } catch {
    return { error: "لا يمكن حذف هذا الطلب لارتباطه بفاتورة سابقة" };
  }

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteOrders(ids: string[]): Promise<ActionResult> {
  const access = await requirePermission("ORDERS_MANAGE");
  if (!access.ok) return { error: access.error };
  if (ids.length === 0) return { success: true };

  let failedCount = 0;
  for (const id of ids) {
    try {
      await prisma.order.delete({ where: { id } });
    } catch {
      failedCount++;
    }
  }

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard");

  if (failedCount > 0) {
    return {
      error: `تعذر حذف ${failedCount} من الطلبات لارتباطها بفواتير سابقة`,
    };
  }
  return { success: true };
}
