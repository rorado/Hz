import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getProductBySlug, getRelatedProducts } from "@/features/products/queries";
import { ProductGallery } from "@/features/products/components/public/product-gallery";
import { ProductCard } from "@/features/products/components/public/product-card";
import { AddToCartInline } from "@/features/cart/components/add-to-cart-inline";
import { getDictionary } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [t, product] = await Promise.all([
    getDictionary(),
    getProductBySlug(slug),
  ]);

  if (!product || product.status !== "ACTIVE") notFound();

  const relatedProducts = await getRelatedProducts({
    categoryId: product.categoryId,
    excludeProductId: product.id,
  });

  const outOfStock = product.quantity <= 0;

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-10">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>
              {t.public.breadcrumbHome}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/products" />}>
              {t.publicNav.products}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              render={
                <Link href={`/products?category=${product.category.slug}`} />
              }
            >
              {product.category.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="line-clamp-1">
              {product.name}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="grid gap-10 lg:grid-cols-2">
        <ProductGallery images={product.images} productName={product.name} />
        <div className="space-y-6">
          <div className="space-y-2">
            <Badge variant="secondary">{product.category.name}</Badge>
            <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
            {product.brand && (
              <p className="text-sm text-muted-foreground">
                {t.products.columnBrand}: {product.brand.name}
              </p>
            )}
          </div>

          {product.description && (
            <div className="space-y-1">
              <h2 className="font-medium">{t.products.descriptionLabel}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {product.description}
              </p>
            </div>
          )}

          <div className="space-y-2 rounded-xl border bg-card p-4">
            <h2 className="font-medium">{t.public.specsLabel}</h2>
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">SKU</dt>
              <dd dir="ltr" className="text-start">
                {product.sku}
              </dd>
              {product.barcode && (
                <>
                  <dt className="text-muted-foreground">{t.products.barcodeColumnLabel}</dt>
                  <dd dir="ltr" className="text-start">
                    {product.barcode}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">{t.products.columnCategory}</dt>
              <dd className="text-start">
                {product.category.name}
              </dd>
            </dl>
          </div>

          <div className="border-t pt-6">
            {outOfStock ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">
                  {t.public.outOfStockMessage}
                </p>
                <Button size="lg" className="w-full sm:w-auto" disabled>
                  {t.products.outOfStock}
                </Button>
              </div>
            ) : (
              <AddToCartInline
                productId={product.id}
                productName={product.name}
                maxQuantity={product.quantity}
              />
            )}
          </div>
        </div>
      </div>

      {relatedProducts.length > 0 && (
        <section className="space-y-6 border-t pt-10">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t.public.relatedProductsTitle}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {relatedProducts.map((related) => (
              <ProductCard
                key={related.id}
                product={related}
                outOfStockLabel={t.products.outOfStock}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
