import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { OrderStatus, PaymentStatus } from "@/generated/prisma/client";
import type { ResolvedRange } from "@/features/dashboard/date-range";

function bounds(range: ResolvedRange) {
  return { from: range.from ?? new Date(0), to: range.to };
}

export type AnalyticsSummary = {
  revenue: number;
  invoiceCount: number;
  avgInvoice: number;
  ordersCount: number;
  newCustomers: number;
  purchasesTotal: number;
};

export async function getAnalyticsSummary(
  range: ResolvedRange,
): Promise<AnalyticsSummary> {
  const { from, to } = bounds(range);

  const [invoiceAgg, ordersCount, newCustomers, purchaseAgg] =
    await Promise.all([
      prisma.invoice.aggregate({
        where: { createdAt: { gte: from, lte: to } },
        _sum: { total: true },
        _count: { _all: true },
        _avg: { total: true },
      }),
      prisma.order.count({
        where: { createdAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      }),
      prisma.customer.count({ where: { createdAt: { gte: from, lte: to } } }),
      prisma.purchaseOrder.aggregate({
        where: { createdAt: { gte: from, lte: to } },
        _sum: { total: true },
      }),
    ]);

  return {
    revenue: Number(invoiceAgg._sum.total ?? 0),
    invoiceCount: invoiceAgg._count._all,
    avgInvoice: Number(invoiceAgg._avg.total ?? 0),
    ordersCount,
    newCustomers,
    purchasesTotal: Number(purchaseAgg._sum.total ?? 0),
  };
}

export type TrendPoint = {
  bucket: string;
  label: string;
  sales: number;
  purchases: number;
};

function truncExpr(granularity: "hour" | "day" | "month") {
  return Prisma.raw(`date_trunc('${granularity}', "createdAt")`);
}

function bucketLabel(date: Date, granularity: "hour" | "day" | "month") {
  if (granularity === "hour") {
    return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  if (granularity === "month") {
    return date.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
  }
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function stepBucket(date: Date, granularity: "hour" | "day" | "month") {
  const next = new Date(date);
  if (granularity === "hour") next.setHours(next.getHours() + 1);
  else if (granularity === "month") next.setMonth(next.getMonth() + 1);
  else next.setDate(next.getDate() + 1);
  return next;
}

export async function getRevenueTrend(range: ResolvedRange): Promise<TrendPoint[]> {
  const { from, to } = bounds(range);
  const { granularity } = range;

  const [salesRows, purchaseRows] = await Promise.all([
    prisma.$queryRaw<{ bucket: Date; total: string }[]>`
      SELECT ${truncExpr(granularity)} as bucket, COALESCE(SUM(total), 0)::numeric as total
      FROM "Invoice"
      WHERE "createdAt" BETWEEN ${from} AND ${to}
      GROUP BY bucket
      ORDER BY bucket
    `,
    prisma.$queryRaw<{ bucket: Date; total: string }[]>`
      SELECT ${truncExpr(granularity)} as bucket, COALESCE(SUM(total), 0)::numeric as total
      FROM "PurchaseOrder"
      WHERE "createdAt" BETWEEN ${from} AND ${to}
      GROUP BY bucket
      ORDER BY bucket
    `,
  ]);

  const salesMap = new Map(salesRows.map((r) => [r.bucket.toISOString(), Number(r.total)]));
  const purchaseMap = new Map(purchaseRows.map((r) => [r.bucket.toISOString(), Number(r.total)]));

  const keys = new Set([...salesMap.keys(), ...purchaseMap.keys()]);

  if (range.from) {
    // Fill continuous buckets so gaps read as zero, not missing data.
    let cursor = new Date(range.from);
    if (granularity === "hour") cursor.setMinutes(0, 0, 0);
    else cursor.setHours(0, 0, 0, 0);
    while (cursor <= to) {
      keys.add(cursor.toISOString());
      cursor = stepBucket(cursor, granularity);
    }
  }

  return [...keys]
    .sort()
    .map((key) => {
      const date = new Date(key);
      return {
        bucket: key,
        label: bucketLabel(date, granularity),
        sales: salesMap.get(key) ?? 0,
        purchases: purchaseMap.get(key) ?? 0,
      };
    });
}

export type StatusBreakdown = { status: string; count: number; total: number };

export async function getOrderStatusBreakdown(
  range: ResolvedRange,
): Promise<StatusBreakdown[]> {
  const { from, to } = bounds(range);
  const rows = await prisma.order.groupBy({
    by: ["status"],
    where: { createdAt: { gte: from, lte: to } },
    _count: { _all: true },
    _sum: { total: true },
  });
  return rows.map((r) => ({
    status: r.status as OrderStatus,
    count: r._count._all,
    total: Number(r._sum.total ?? 0),
  }));
}

export async function getPaymentStatusBreakdown(
  range: ResolvedRange,
): Promise<StatusBreakdown[]> {
  const { from, to } = bounds(range);
  const rows = await prisma.invoice.groupBy({
    by: ["paymentStatus"],
    where: { createdAt: { gte: from, lte: to } },
    _count: { _all: true },
    _sum: { total: true },
  });
  return rows.map((r) => ({
    status: r.paymentStatus as PaymentStatus,
    count: r._count._all,
    total: Number(r._sum.total ?? 0),
  }));
}

export type TopProduct = { key: string; name: string; quantity: number; revenue: number };

export async function getTopProducts(
  range: ResolvedRange,
  limit = 8,
): Promise<TopProduct[]> {
  const { from, to } = bounds(range);
  const rows = await prisma.$queryRaw<
    { key: string; name: string; quantity: bigint; revenue: string }[]
  >`
    SELECT COALESCE(ii."productId", ii.name) as key, MIN(ii.name) as name,
      SUM(ii.quantity)::bigint as quantity,
      SUM(ii.quantity * ii."unitPrice")::numeric as revenue
    FROM "InvoiceItem" ii
    JOIN "Invoice" i ON i.id = ii."invoiceId"
    WHERE i."createdAt" BETWEEN ${from} AND ${to}
    GROUP BY key
    ORDER BY revenue DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    key: r.key,
    name: r.name,
    quantity: Number(r.quantity),
    revenue: Number(r.revenue),
  }));
}

export type TopCustomer = {
  id: string;
  name: string;
  invoiceCount: number;
  total: number;
};

export async function getTopCustomers(
  range: ResolvedRange,
  limit = 8,
): Promise<TopCustomer[]> {
  const { from, to } = bounds(range);
  const rows = await prisma.$queryRaw<
    { id: string; name: string; invoiceCount: bigint; total: string }[]
  >`
    SELECT i."customerId" as id, MIN(i."customerName") as name,
      COUNT(*)::bigint as "invoiceCount", SUM(i.total)::numeric as total
    FROM "Invoice" i
    WHERE i."createdAt" BETWEEN ${from} AND ${to} AND i."customerId" IS NOT NULL
    GROUP BY i."customerId"
    ORDER BY total DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    invoiceCount: Number(r.invoiceCount),
    total: Number(r.total),
  }));
}

export type CategorySales = { category: string; revenue: number };

export async function getSalesByCategory(
  range: ResolvedRange,
): Promise<CategorySales[]> {
  const { from, to } = bounds(range);
  const rows = await prisma.$queryRaw<{ category: string; revenue: string }[]>`
    SELECT c.name as category, SUM(ii.quantity * ii."unitPrice")::numeric as revenue
    FROM "InvoiceItem" ii
    JOIN "Invoice" i ON i.id = ii."invoiceId"
    JOIN "Product" p ON p.id = ii."productId"
    JOIN "Category" c ON c.id = p."categoryId"
    WHERE i."createdAt" BETWEEN ${from} AND ${to}
    GROUP BY c.name
    ORDER BY revenue DESC
  `;
  return rows.map((r) => ({ category: r.category, revenue: Number(r.revenue) }));
}
