import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { BackButton } from "@/components/shared/back-button";
import { getSupplierOptions } from "@/features/suppliers/queries";
import { getProductPickerOptions } from "@/features/products/queries";
import { PurchaseOrderForm } from "@/features/purchases/components/purchase-order-form";
import { getDictionary } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function NewPurchaseOrderPage() {
  const [t, suppliers, productRows] = await Promise.all([
    getDictionary(),
    getSupplierOptions(),
    getProductPickerOptions(),
  ]);
  const products = productRows.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    categoryId: product.categoryId,
    categoryName: product.category.name,
    brandId: product.brandId,
    brandName: product.brand?.name ?? null,
    price1: Number(product.price1),
    price2: Number(product.price2),
    price3: Number(product.price3),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.purchases.addButton}
        icon={ClipboardList}
        action={<BackButton fallbackHref="/dashboard/purchases" />}
      />
      <div className="max-w-2xl">
        <PurchaseOrderForm suppliers={suppliers} products={products} />
      </div>
    </div>
  );
}
