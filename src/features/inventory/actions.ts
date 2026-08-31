"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { inventoryMovementSchema } from "@/features/inventory/schema";
import { getDictionary } from "@/i18n/server";

type ActionResult = { error?: string; success?: boolean };

export async function recordInventoryMovement(
  input: unknown,
): Promise<ActionResult> {
  const access = await requirePermission("INVENTORY_MANAGE");
  if (!access.ok) return { error: access.error };
  const t = await getDictionary();

  const parsed = inventoryMovementSchema.safeParse(input);
  if (!parsed.success) return { error: t.inventory.validationError };

  const { productId, type, quantity, reason } = parsed.data;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return { error: t.inventory.notFoundError };

  let newQuantity: number;
  let movementQuantity: number;

  if (type === "IN") {
    newQuantity = product.quantity + quantity;
    movementQuantity = quantity;
  } else if (type === "OUT") {
    if (quantity > product.quantity) {
      return { error: t.inventory.exceedsAvailableError };
    }
    newQuantity = product.quantity - quantity;
    movementQuantity = quantity;
  } else {
    // Stored as a signed delta (new - old), not Math.abs of it — an
    // unsigned magnitude here would make this row's direction
    // unrecoverable later (e.g. when reconstructing historical stock by
    // walking movements backward from the live quantity), since the same
    // ADJUSTMENT type label covers both increases and decreases.
    newQuantity = quantity;
    movementQuantity = quantity - product.quantity;
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
        createdById: access.adminId,
      },
    }),
  ]);

  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard");
  return { success: true };
}
