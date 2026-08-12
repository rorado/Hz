import "server-only";
import { prisma } from "@/lib/prisma";

export const MOVEMENTS_PAGE_SIZE = 15;

export async function getInventoryMovementsPage({ page }: { page: number }) {
  // Legacy databases can contain movements whose product was removed before
  // the current foreign-key restriction was introduced.
  const where = { product: { isNot: {} } };

  const [items, total] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where,
      include: { product: { select: { name: true, sku: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * MOVEMENTS_PAGE_SIZE,
      take: MOVEMENTS_PAGE_SIZE,
    }),
    prisma.inventoryMovement.count({ where }),
  ]);

  return { items, total, pageSize: MOVEMENTS_PAGE_SIZE };
}
