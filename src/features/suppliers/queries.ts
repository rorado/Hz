import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const SUPPLIERS_PAGE_SIZE = 10;

export async function getSuppliersPage({
  query,
  page,
  orders,
  balance,
  sort,
}: {
  query?: string;
  page: number;
  orders?: "withOrders" | "withoutOrders";
  balance?: "outstanding" | "paid";
  sort?: "name" | "orders";
}) {
  const filters: Prisma.SupplierWhereInput[] = [];
  if (query) {
    filters.push({ name: { contains: query, mode: "insensitive" } });
  }
  if (orders === "withOrders") {
    filters.push({ purchaseOrders: { some: {} } });
  } else if (orders === "withoutOrders") {
    filters.push({ purchaseOrders: { none: {} } });
  }
  if (balance === "outstanding") {
    filters.push({
      purchaseOrders: {
        some: { paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] } },
      },
    });
  } else if (balance === "paid") {
    filters.push({
      purchaseOrders: {
        none: { paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] } },
      },
    });
  }
  const where: Prisma.SupplierWhereInput =
    filters.length > 0 ? { AND: filters } : {};

  const orderBy =
    sort === "name"
      ? ({ name: "asc" } as const)
      : sort === "orders"
        ? ({ purchaseOrders: { _count: "desc" } } as const)
        : ({ createdAt: "desc" } as const);

  const [items, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        address: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { purchaseOrders: true } },
      },
      orderBy,
      skip: (page - 1) * SUPPLIERS_PAGE_SIZE,
      take: SUPPLIERS_PAGE_SIZE,
    }),
    prisma.supplier.count({ where }),
  ]);

  return { items, total, pageSize: SUPPLIERS_PAGE_SIZE };
}

export async function getSupplierOptions() {
  return prisma.supplier.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function getSupplierById(id: string) {
  return prisma.supplier.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getSupplierProfile(id: string) {
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: { balanceHistory: { orderBy: { createdAt: "desc" }, take: 50 } },
  });
  if (!supplier) return null;

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { supplierId: id },
    orderBy: { createdAt: "desc" },
    include: {
      items: true,
      payments: { orderBy: { createdAt: "desc" } },
    },
  });

  const totalPurchased = purchaseOrders.reduce(
    (sum, order) => sum + Number(order.total),
    0,
  );
  const totalPaid = purchaseOrders.reduce(
    (sum, order) => sum + Number(order.paidAmount),
    0,
  );
  const totalOutstanding = purchaseOrders.reduce(
    (sum, order) =>
      sum + Math.max(0, Number(order.total) - Number(order.paidAmount)),
    0,
  );

  const payments = purchaseOrders
    .flatMap((order) =>
      order.payments.map((payment) => ({
        ...payment,
        orderNumber: order.orderNumber,
        purchaseOrderId: order.id,
      })),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    supplier,
    purchaseOrders,
    payments,
    totals: { totalPurchased, totalPaid, totalOutstanding },
  };
}
