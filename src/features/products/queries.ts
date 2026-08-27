import "server-only";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import type { Prisma } from "@/generated/prisma/client";

export const PRODUCTS_PAGE_SIZE = 10;

export type ProductStockFilter = "all" | "low" | "out" | "available";
export type ProductQuantitySort = "newest" | "quantityAsc" | "quantityDesc";

export async function getProductsPage({
  query,
  page,
  categoryId,
  status,
  stock,
  sort = "newest",
}: {
  query?: string;
  page: number;
  categoryId?: string;
  status?: "ACTIVE" | "INACTIVE";
  stock?: ProductStockFilter;
  sort?: ProductQuantitySort;
}) {
  const where: Prisma.ProductWhereInput = {
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { sku: { contains: query, mode: "insensitive" } },
            { barcode: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(status ? { status } : {}),
    ...(stock === "low"
      ? { quantity: { lte: prisma.product.fields.minStockLevel } }
      : stock === "out"
        ? { quantity: { lte: 0 } }
        : stock === "available"
          ? { quantity: { gt: 0 } }
          : {}),
  };

  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    sort === "quantityAsc"
      ? [{ quantity: "asc" }, { createdAt: "desc" }]
      : sort === "quantityDesc"
        ? [{ quantity: "desc" }, { createdAt: "desc" }]
        : [{ createdAt: "desc" }];

  const [items, total] = await withDbRetry(() =>
    Promise.all([
      prisma.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          sku: true,
          quantity: true,
          minStockLevel: true,
          status: true,
          category: { select: { name: true } },
          brand: { select: { name: true } },
          images: { orderBy: { position: "asc" }, take: 1 },
        },
        orderBy,
        skip: (page - 1) * PRODUCTS_PAGE_SIZE,
        take: PRODUCTS_PAGE_SIZE,
      }),
      prisma.product.count({ where }),
    ]),
  );

  return { items, total, pageSize: PRODUCTS_PAGE_SIZE };
}

export async function getProductById(id: string) {
  return prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      sku: true,
      barcode: true,
      description: true,
      categoryId: true,
      brandId: true,
      category: { select: { name: true } },
      brand: { select: { name: true } },
      quantity: true,
      minStockLevel: true,
      price1: true,
      price2: true,
      price3: true,
      purchasePrice: true,
      weight: true,
      status: true,
      images: { orderBy: { position: "asc" } },
    },
  });
}

export async function getProductBySlug(slug: string) {
  return prisma.product.findUnique({
    where: { slug },
    include: {
      images: { orderBy: { position: "asc" } },
      category: true,
      brand: true,
    },
  });
}

export const PUBLIC_PRODUCTS_PAGE_SIZE = 12;

export async function getPublicProductsPage({
  query,
  categorySlug,
  page,
}: {
  query?: string;
  categorySlug?: string;
  page: number;
}) {
  const where: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    ...(query ? { name: { contains: query, mode: "insensitive" } } : {}),
    ...(categorySlug ? { category: { slug: categorySlug } } : {}),
  };

  const [items, total] = await withDbRetry(() =>
    Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: { select: { name: true, slug: true } },
          brand: { select: { name: true } },
          images: { orderBy: { position: "asc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PUBLIC_PRODUCTS_PAGE_SIZE,
        take: PUBLIC_PRODUCTS_PAGE_SIZE,
      }),
      prisma.product.count({ where }),
    ]),
  );

  return { items, total, pageSize: PUBLIC_PRODUCTS_PAGE_SIZE };
}

export const RELATED_PRODUCTS_LIMIT = 4;

export async function getRelatedProducts({
  categoryId,
  excludeProductId,
}: {
  categoryId: string;
  excludeProductId: string;
}) {
  return prisma.product.findMany({
    where: {
      categoryId,
      status: "ACTIVE",
      NOT: { id: excludeProductId },
    },
    include: {
      category: { select: { name: true, slug: true } },
      images: { orderBy: { position: "asc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: RELATED_PRODUCTS_LIMIT,
  });
}

export async function getProductSelectOptions() {
  return prisma.product.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, sku: true, barcode: true, quantity: true },
  });
}

/** Product options carrying the three price tiers, for pickers that let the
 * admin choose one of the product's prices or type a custom price. */
export async function getProductPickerOptions() {
  return prisma.product.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      price1: true,
      price2: true,
      price3: true,
      quantity: true,
      categoryId: true,
      brandId: true,
      category: { select: { name: true } },
      brand: { select: { name: true } },
    },
  });
}

export const LOW_STOCK_PAGE_SIZE = 10;

export async function getLowStockProductsPage({ page }: { page: number }) {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      name: string;
      sku: string;
      quantity: number;
      minStockLevel: number;
      totalCount: bigint;
    }[]
  >`SELECT id, name, sku, quantity, "minStockLevel", COUNT(*) OVER()::bigint AS "totalCount"
    FROM public."Product"
    WHERE quantity <= "minStockLevel"
    ORDER BY quantity ASC
    LIMIT ${LOW_STOCK_PAGE_SIZE} OFFSET ${(page - 1) * LOW_STOCK_PAGE_SIZE}`;

  const total = rows.length > 0 ? Number(rows[0].totalCount) : 0;

  return {
    items: rows.map(({ totalCount, ...row }) => row),
    total,
    pageSize: LOW_STOCK_PAGE_SIZE,
  };
}

export const PRODUCT_CUSTOMERS_PAGE_SIZE = 10;

export async function getProductCustomersPage({
  productId,
  query,
  page,
}: {
  productId: string;
  query?: string;
  page: number;
}) {
  const search = query ? `%${query}%` : null;
  const rows = await prisma.$queryRaw<
    {
      customerId: string | null;
      customerName: string;
      customerPhone: string;
      totalQuantity: number;
      ordersCount: number;
      lastPurchaseAt: Date;
      totalCount: bigint;
    }[]
  >`
    WITH customer_rows AS (
      SELECT
        o.id AS "orderId",
        o."customerId",
        o."customerName",
        o."customerPhone",
        o."createdAt",
        oi.quantity
      FROM "OrderItem" oi
      INNER JOIN "Order" o ON o.id = oi."orderId"
      WHERE oi."productId" = ${productId}
    ),
    grouped AS (
      SELECT
        COALESCE("customerId", 'guest:' || "customerPhone") AS "groupKey",
        "customerId",
        (ARRAY_AGG("customerName" ORDER BY "createdAt" DESC))[1] AS "customerName",
        (ARRAY_AGG("customerPhone" ORDER BY "createdAt" DESC))[1] AS "customerPhone",
        SUM(quantity)::int AS "totalQuantity",
        COUNT(DISTINCT "orderId")::int AS "ordersCount",
        MAX("createdAt") AS "lastPurchaseAt"
      FROM customer_rows
      GROUP BY "groupKey", "customerId"
    )
    SELECT
      "customerId",
      "customerName",
      "customerPhone",
      "totalQuantity",
      "ordersCount",
      "lastPurchaseAt",
      COUNT(*) OVER()::bigint AS "totalCount"
    FROM grouped
    WHERE (${search}::text IS NULL OR "customerName" ILIKE ${search})
    ORDER BY "lastPurchaseAt" DESC
    LIMIT ${PRODUCT_CUSTOMERS_PAGE_SIZE} OFFSET ${(page - 1) * PRODUCT_CUSTOMERS_PAGE_SIZE}
  `;

  const total = rows.length > 0 ? Number(rows[0].totalCount) : 0;

  return {
    items: rows.map(({ totalCount, ...row }) => row),
    total,
    pageSize: PRODUCT_CUSTOMERS_PAGE_SIZE,
  };
}

const PRODUCT_PROFILE_HISTORY_SIZE = 20;

export async function getProductProfile(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: { select: { name: true } },
      brand: { select: { name: true } },
      images: { orderBy: { position: "asc" } },
    },
  });
  if (!product) return null;

  const [movements, orderItems, soldTotal] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where: { productId: id },
      orderBy: { createdAt: "desc" },
      take: PRODUCT_PROFILE_HISTORY_SIZE,
    }),
    prisma.orderItem.findMany({
      where: { productId: id },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: { order: { createdAt: "desc" } },
      take: PRODUCT_PROFILE_HISTORY_SIZE,
    }),
    prisma.orderItem.aggregate({
      where: { productId: id },
      _sum: { quantity: true },
    }),
  ]);

  return {
    product,
    movements,
    orderItems,
    totalSold: soldTotal._sum.quantity ?? 0,
  };
}
