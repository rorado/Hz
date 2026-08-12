import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const REPORTS_PAGE_SIZE = 10;

export async function getInventoryReportData(limit?: number) {
  return prisma.product.findMany({
    include: {
      category: { select: { name: true } },
      brand: { select: { name: true } },
    },
    orderBy: { name: "asc" },
    take: limit,
  });
}

export async function getInventoryReportPage({ page }: { page: number }) {
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      include: {
        category: { select: { name: true } },
        brand: { select: { name: true } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * REPORTS_PAGE_SIZE,
      take: REPORTS_PAGE_SIZE,
    }),
    prisma.product.count(),
  ]);

  return { items, total, pageSize: REPORTS_PAGE_SIZE };
}

export async function getProductsReportData(limit?: number) {
  return prisma.product.findMany({
    include: {
      category: { select: { name: true } },
      brand: { select: { name: true } },
      images: { orderBy: { position: "asc" }, select: { secureUrl: true } },
    },
    orderBy: { name: "asc" },
    take: limit,
  });
}

export async function getProductsReportPage({ page }: { page: number }) {
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      include: {
        category: { select: { name: true } },
        brand: { select: { name: true } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * REPORTS_PAGE_SIZE,
      take: REPORTS_PAGE_SIZE,
    }),
    prisma.product.count(),
  ]);

  return { items, total, pageSize: REPORTS_PAGE_SIZE };
}

export async function getPurchasesReportData(limit?: number) {
  return prisma.purchaseOrder.findMany({
    include: { supplier: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getPurchasesReportPage({ page }: { page: number }) {
  const [items, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      include: { supplier: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * REPORTS_PAGE_SIZE,
      take: REPORTS_PAGE_SIZE,
    }),
    prisma.purchaseOrder.count(),
  ]);

  return { items, total, pageSize: REPORTS_PAGE_SIZE };
}

export async function getSuppliersReportData(limit?: number) {
  const suppliers = await prisma.supplier.findMany({
    include: { purchaseOrders: { select: { total: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return suppliers.map(mapSupplierReportRow);
}

export async function getSuppliersReportPage({ page }: { page: number }) {
  const [suppliers, total] = await Promise.all([
    prisma.supplier.findMany({
      include: { purchaseOrders: { select: { total: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * REPORTS_PAGE_SIZE,
      take: REPORTS_PAGE_SIZE,
    }),
    prisma.supplier.count(),
  ]);

  return {
    items: suppliers.map(mapSupplierReportRow),
    total,
    pageSize: REPORTS_PAGE_SIZE,
  };
}

function mapSupplierReportRow(supplier: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  purchaseOrders: { total: Prisma.Decimal | number }[];
}) {
  return {
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    ordersCount: supplier.purchaseOrders.length,
    totalPurchased: supplier.purchaseOrders.reduce(
      (sum, order) => sum + Number(order.total),
      0,
    ),
  };
}

export async function getOrdersReportData(limit?: number) {
  return prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getOrdersReportPage({ page }: { page: number }) {
  const [items, total] = await Promise.all([
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * REPORTS_PAGE_SIZE,
      take: REPORTS_PAGE_SIZE,
    }),
    prisma.order.count(),
  ]);

  return { items, total, pageSize: REPORTS_PAGE_SIZE };
}

export async function getCustomersReportData(limit?: number) {
  const customers = await prisma.customer.findMany({
    include: { orders: { select: { total: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return customers.map(mapCustomerReportRow);
}

export async function getCustomersReportPage({ page }: { page: number }) {
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      include: { orders: { select: { total: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * REPORTS_PAGE_SIZE,
      take: REPORTS_PAGE_SIZE,
    }),
    prisma.customer.count(),
  ]);

  return {
    items: customers.map(mapCustomerReportRow),
    total,
    pageSize: REPORTS_PAGE_SIZE,
  };
}

function mapCustomerReportRow(customer: {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  orders: { total: Prisma.Decimal | number }[];
}) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    ordersCount: customer.orders.length,
    totalSpent: customer.orders.reduce(
      (sum, order) => sum + Number(order.total),
      0,
    ),
  };
}
