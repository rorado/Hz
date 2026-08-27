"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { inventoryMovementSchema } from "@/features/inventory/schema";

type ActionResult = { error?: string; success?: boolean };

export async function recordInventoryMovement(
  input: unknown,
): Promise<ActionResult> {
  const access = await requirePermission("INVENTORY_MANAGE");
  if (!access.ok) return { error: access.error };

  const parsed = inventoryMovementSchema.safeParse(input);
  if (!parsed.success) return { error: "الرجاء التحقق من البيانات المدخلة" };

  const { productId, type, quantity, reason } = parsed.data;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return { error: "المنتج غير موجود" };

  let newQuantity: number;
  let movementQuantity: number;

  if (type === "IN") {
    newQuantity = product.quantity + quantity;
    movementQuantity = quantity;
  } else if (type === "OUT") {
    if (quantity > product.quantity) {
      return { error: "الكمية المطلوب إخراجها أكبر من الكمية المتوفرة حالياً" };
    }
    newQuantity = product.quantity - quantity;
    movementQuantity = quantity;
  } else {
    newQuantity = quantity;
    movementQuantity = Math.abs(quantity - product.quantity);
  }

  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { quantity: newQuantity },
    }),
    prisma.inventoryMovement.create({
      data: {
        productId,
        type,
        quantity: movementQuantity,
        reason: reason || null,
      },
    }),
  ]);

  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard");
  return { success: true };
}
