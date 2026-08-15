import "server-only";
import { prisma } from "@/lib/prisma";

export const PURCHASE_ORDERS_PAGE_SIZE = 10;

export async function getPurchaseOrdersPage({ page }: { page: number }) {
  const [items, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      include: { supplier: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PURCHASE_ORDERS_PAGE_SIZE,
      take: PURCHASE_ORDERS_PAGE_SIZE,
    }),
    prisma.purchaseOrder.count({ where: {} }),
  ]);

  return { items, total, pageSize: PURCHASE_ORDERS_PAGE_SIZE };
}

export async function getPurchaseOrderById(id: string) {
  return prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      items: {
        include: {
          product: { select: { name: true, sku: true, weight: true } },
        },
      },
      payments: { orderBy: { createdAt: "desc" } },
      returns: { where: { status: "CONFIRMED" }, include: { items: true }, orderBy: { createdAt: "desc" } },
    },
  });
}
