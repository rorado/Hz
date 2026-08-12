import "server-only";

import { prisma } from "@/lib/prisma";
import { getDictionary } from "@/i18n/server";
import { formatMessage } from "@/i18n/format";

export async function validateAvailableStock(
  items: Array<{ productId?: string | null; quantity: number }>,
): Promise<string | null> {
  const requestedByProduct = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) continue;
    requestedByProduct.set(
      item.productId,
      (requestedByProduct.get(item.productId) ?? 0) + item.quantity,
    );
  }
  if (requestedByProduct.size === 0) return null;

  const products = await prisma.product.findMany({
    where: { id: { in: [...requestedByProduct.keys()] } },
    select: { id: true, name: true, quantity: true },
  });
  const t = await getDictionary();

  for (const product of products) {
    const requested = requestedByProduct.get(product.id) ?? 0;
    if (requested > product.quantity) {
      return formatMessage(t.common.insufficientProductStockTemplate, {
        product: product.name,
        requested,
        available: product.quantity,
      });
    }
  }

  return null;
}
