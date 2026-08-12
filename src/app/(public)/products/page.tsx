import Link from "next/link";
import { Package } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getPublicProductsPage } from "@/features/products/queries";
import { getPublicCategoriesWithCounts } from "@/features/categories/queries";
import { ProductCard } from "@/features/products/components/public/product-card";
import { ProductsFilterBar } from "@/features/products/components/public/products-filter-bar";
import { getDictionary } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; category?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const query = params.q?.trim() || undefined;
  const categorySlug = params.category || undefined;

  const [t, { items, total, pageSize }, categories] = await Promise.all([
    getDictionary(),
    getPublicProductsPage({ query, categorySlug, page }),
    getPublicCategoriesWithCounts(),
  ]);

  const activeCategory = categories.find((c) => c.slug === categorySlug);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>
              {t.public.breadcrumbHome}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t.publicNav.products}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">
          {activeCategory ? activeCategory.name : t.publicNav.products}
        </h1>
        <p className="text-sm text-muted-foreground">
          {total.toLocaleString()} {t.public.statProductsLabel}
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <ProductsFilterBar categories={categories} />
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Package} title={t.public.noMatchingProducts} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                outOfStockLabel={t.products.outOfStock}
              />
            ))}
          </div>
          <DataTablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            basePath="/products"
            searchParams={{ q: query, category: categorySlug }}
          />
        </>
      )}
    </div>
  );
}
