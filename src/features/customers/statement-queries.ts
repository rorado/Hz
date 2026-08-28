import "server-only";
import { prisma } from "@/lib/prisma";
import type { ResolvedRange } from "@/features/dashboard/date-range";

function bounds(range: ResolvedRange) {
  return { from: range.from ?? new Date(0), to: range.to };
}

export type CustomerProductAnalysis = {
  key: string;
  name: string;
  quantity: number;
  purchases: number;
  totalSpent: number;
  avgPrice: number;
  /** Unit price actually charged on this product's most recent purchase in
   * the period — an immutable historical snapshot (InvoiceItem.unitPrice),
   * never recomputed from the product's current price. */
  purchasedPrice: number;
  purchasedDate: Date;
  purchasedQuantity: number;
  /** The product's live current default price (Product.price1) as of now
   * — this is what actually answers "did the price change since this
   * customer bought it", including admin edits made after the purchase.
   * Null only if the product record itself no longer exists. */
  currentPrice: number | null;
};

/**
 * Per-product purchase breakdown for the period, comparing what the
 * customer actually paid (the immutable historical unit price on their most
 * recent purchase of it) against the product's current live price — so an
 * admin price change made after the sale shows up here, even if the
 * customer only ever bought that product once.
 */
export async function getCustomerProductAnalysis(
  customerId: string,
  range: ResolvedRange,
): Promise<CustomerProductAnalysis[]> {
  const { from, to } = bounds(range);

  const rows = await prisma.$queryRaw<
    {
      key: string;
      name: string;
      quantity: bigint;
      purchases: bigint;
      totalSpent: string;
      purchasedPrice: string;
      purchasedDate: Date;
      purchasedQuantity: number;
      currentPrice: string | null;
    }[]
  >`
    WITH in_period AS (
      SELECT
        COALESCE(ii."productId", ii.name) as key,
        ii."productId",
        ii.name, ii.quantity, ii."unitPrice", i."createdAt", i.id as "invoiceId"
      FROM public."InvoiceItem" ii
      JOIN public."Invoice" i ON i.id = ii."invoiceId"
      WHERE i."customerId" = ${customerId} AND i."createdAt" BETWEEN ${from} AND ${to}
    ),
    agg AS (
      SELECT key, MIN(name) as name, MIN("productId") as "productId",
        SUM(quantity)::bigint as quantity,
        COUNT(DISTINCT "invoiceId")::bigint as purchases,
        SUM(quantity * "unitPrice")::numeric as "totalSpent"
      FROM in_period
      GROUP BY key
    ),
    ranked AS (
      SELECT key, "unitPrice", "createdAt", quantity,
        ROW_NUMBER() OVER (PARTITION BY key ORDER BY "createdAt" DESC) as rn
      FROM in_period
    )
    SELECT
      agg.key, agg.name, agg.quantity, agg.purchases, agg."totalSpent",
      latest."unitPrice" as "purchasedPrice",
      latest."createdAt" as "purchasedDate",
      latest.quantity as "purchasedQuantity",
      p.price1 as "currentPrice"
    FROM agg
    JOIN ranked latest ON latest.key = agg.key AND latest.rn = 1
    LEFT JOIN public."Product" p ON p.id = agg."productId"
    ORDER BY agg."totalSpent" DESC
  `;

  return rows.map((row) => {
    const quantity = Number(row.quantity);
    const totalSpent = Number(row.totalSpent);
    return {
      key: row.key,
      name: row.name,
      quantity,
      purchases: Number(row.purchases),
      totalSpent,
      avgPrice: quantity > 0 ? totalSpent / quantity : 0,
      purchasedPrice: Number(row.purchasedPrice),
      purchasedDate: row.purchasedDate,
      purchasedQuantity: Number(row.purchasedQuantity),
      currentPrice: row.currentPrice !== null ? Number(row.currentPrice) : null,
    };
  });
}
