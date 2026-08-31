import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export const REPORTS_PAGE_SIZE = 10;

export type InventoryHistoricalReportRow = {
  id: string;
  name: string;
  sku: string;
  categoryName: string;
  brandName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  quantity: number;
  minStockLevel: number;
  status: "ACTIVE" | "INACTIVE";
  purchasePrice: number;
  value: number;
};

async function fetchInventoryHistoricalReportRows({
  asOfDate,
  supplierId,
  query,
  skip,
  take,
}: {
  asOfDate: Date;
  supplierId?: string;
  query?: string;
  skip?: number;
  take?: number;
}): Promise<{
  items: InventoryHistoricalReportRow[];
  total: number;
  totals: { quantity: number; value: number };
}> {
  const searchClause = query
    ? Prisma.sql`AND (p.name ILIKE ${"%" + query + "%"} OR p.sku ILIKE ${"%" + query + "%"})`
    : Prisma.empty;
  const supplierClause = supplierId
    ? Prisma.sql`AND s.id = ${supplierId}`
    : Prisma.empty;
  const limitOffsetClause =
    take !== undefined
      ? Prisma.sql`LIMIT ${take} OFFSET ${skip ?? 0}`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<
    {
      id: string;
      name: string;
      sku: string;
      categoryName: string;
      brandName: string | null;
      supplierId: string | null;
      supplierName: string | null;
      quantity: number;
      minStockLevel: number;
      status: "ACTIVE" | "INACTIVE";
      purchasePrice: string;
      totalCount: bigint;
      totalQuantitySum: bigint | null;
      totalValueSum: string | null;
    }[]
  >`
    WITH movement_effect AS (
      SELECT "productId",
        CASE WHEN "type" = 'OUT' THEN -"quantity" ELSE "quantity" END AS effect,
        "createdAt"
      FROM public."InventoryMovement"
      WHERE "productId" IS NOT NULL
    ),
    reversal AS (
      SELECT "productId", SUM(effect)::int AS "reverseAmount"
      FROM movement_effect
      WHERE "createdAt" > ${asOfDate}
      GROUP BY "productId"
    ),
    latest_supplier AS (
      SELECT DISTINCT ON (poi."productId") poi."productId" AS "productId", po."supplierId"
      FROM public."PurchaseOrderItem" poi
      JOIN public."PurchaseOrder" po ON po.id = poi."purchaseOrderId"
      WHERE po.status = 'RECEIVED' AND po."receivedAt" <= ${asOfDate}
      ORDER BY poi."productId", po."receivedAt" DESC, po.id DESC
    )
    SELECT
      p.id, p.name, p.sku, p."minStockLevel", p.status,
      p."purchasePrice"::numeric AS "purchasePrice",
      c.name AS "categoryName", b.name AS "brandName",
      s.id AS "supplierId", s.name AS "supplierName",
      (p.quantity - COALESCE(r."reverseAmount", 0))::int AS "quantity",
      COUNT(*) OVER()::bigint AS "totalCount",
      SUM(p.quantity - COALESCE(r."reverseAmount", 0)) OVER()::bigint AS "totalQuantitySum",
      SUM((p.quantity - COALESCE(r."reverseAmount", 0)) * p."purchasePrice") OVER()::numeric AS "totalValueSum"
    FROM public."Product" p
    JOIN public."Category" c ON c.id = p."categoryId"
    LEFT JOIN public."Brand" b ON b.id = p."brandId"
    LEFT JOIN reversal r ON r."productId" = p.id
    LEFT JOIN latest_supplier ls ON ls."productId" = p.id
    LEFT JOIN public."Supplier" s ON s.id = ls."supplierId"
    WHERE p."createdAt" <= ${asOfDate}
    ${searchClause}
    ${supplierClause}
    ORDER BY p.name ASC
    ${limitOffsetClause}
  `;

  const total = rows.length > 0 ? Number(rows[0].totalCount) : 0;
  const totals = {
    quantity: rows.length > 0 ? Number(rows[0].totalQuantitySum ?? 0) : 0,
    value: rows.length > 0 ? Number(rows[0].totalValueSum ?? 0) : 0,
  };

  return {
    items: rows.map((row) => {
      const purchasePrice = Number(row.purchasePrice);
      return {
        id: row.id,
        name: row.name,
        sku: row.sku,
        categoryName: row.categoryName,
        brandName: row.brandName,
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        quantity: row.quantity,
        minStockLevel: row.minStockLevel,
        status: row.status,
        purchasePrice,
        value: row.quantity * purchasePrice,
      };
    }),
    total,
    totals,
  };
}

export async function getInventoryReportData({
  asOfDate,
  supplierId,
  query,
  limit,
}: {
  asOfDate: Date;
  supplierId?: string;
  query?: string;
  limit?: number;
}) {
  return fetchInventoryHistoricalReportRows({
    asOfDate,
    supplierId,
    query,
    take: limit,
  });
}

export async function getInventoryReportPage({
  page,
  asOfDate,
  supplierId,
  query,
}: {
  page: number;
  asOfDate: Date;
  supplierId?: string;
  query?: string;
}) {
  const { items, total, totals } = await fetchInventoryHistoricalReportRows({
    asOfDate,
    supplierId,
    query,
    skip: (page - 1) * REPORTS_PAGE_SIZE,
    take: REPORTS_PAGE_SIZE,
  });

  return { items, total, pageSize: REPORTS_PAGE_SIZE, totals };
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
