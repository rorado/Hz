import Link from "next/link";
import Image from "next/image";
import {
  FolderTree,
  ShieldCheck,
  Zap,
  PackageCheck,
  Package,
  ShoppingCart,
  CheckCircle2,
  Truck,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { getPublicProductsPage } from "@/features/products/queries";
import { getPublicCategoriesWithCounts } from "@/features/categories/queries";
import { ProductCard } from "@/features/products/components/public/product-card";
import { getDictionary } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [t, { items: latestProducts }, categories] = await Promise.all([
    getDictionary(),
    getPublicProductsPage({ page: 1 }),
    getPublicCategoriesWithCounts(),
  ]);

  const HIGHLIGHTS = [
    {
      icon: ShieldCheck,
      title: t.public.highlightAuthentic,
      desc: t.public.highlightAuthenticDesc,
    },
    {
      icon: Zap,
      title: t.public.highlightFastConfirmation,
      desc: t.public.highlightFastConfirmationDesc,
    },
    {
      icon: PackageCheck,
      title: t.public.highlightInventoryTracking,
      desc: t.public.highlightInventoryTrackingDesc,
    },
  ];

  const HOW_TO_ORDER = [
    { icon: Package, title: t.public.howToOrderStep1Title, desc: t.public.howToOrderStep1Desc },
    { icon: ShoppingCart, title: t.public.howToOrderStep2Title, desc: t.public.howToOrderStep2Desc },
    { icon: CheckCircle2, title: t.public.howToOrderStep3Title, desc: t.public.howToOrderStep3Desc },
    { icon: Truck, title: t.public.howToOrderStep4Title, desc: t.public.howToOrderStep4Desc },
  ];

  const featuredProducts = latestProducts.slice(0, 8);
  const featuredCategories = categories.slice(0, 6);

  return (
    <div>
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_oklch,var(--color-primary)_10%,transparent),transparent)]"
        />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="relative">
              <div className="relative aspect-4/3 overflow-hidden rounded-3xl shadow-xl ring-1 ring-black/5">
                <Image
                  src="/hero.png"
                  alt=""
                  fill
                  priority
                  className="object-cover"
                  sizes="(min-width: 1024px) 45vw, 90vw"
                />
              </div>
              <div className="absolute -top-4 inset-s-4 z-10 flex items-center gap-2.5 rounded-xl border bg-card px-3.5 py-2.5 shadow-lg">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ShieldCheck className="size-5" />
                </span>
                <div className="leading-tight">
                  <p className="text-sm font-semibold">{t.public.heroBadgeTitle}</p>
                  <p className="text-xs text-muted-foreground">{t.public.heroBadgeSubtitle}</p>
                </div>
              </div>
            </div>

            <div className="space-y-6 text-center lg:text-start">
              <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
                <span className="block">{t.public.heroTitleLine1}</span>
                <span className="block text-primary">{t.public.heroTitleLine2}</span>
              </h1>
              <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                {t.public.heroDescription}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                <Button
                  size="lg"
                  className="cursor-pointer shadow-lg shadow-primary/25"
                  nativeButton={false}
                  render={<Link href="/products">{t.public.heroCtaPrimary}</Link>}
                />
                <Button
                  size="lg"
                  variant="outline"
                  className="cursor-pointer"
                  nativeButton={false}
                  render={<Link href="/categories">{t.public.heroCtaSecondary}</Link>}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {HIGHLIGHTS.map((item) => (
            <div
              key={item.title}
              className="flex items-start gap-3 rounded-2xl border bg-card p-5 shadow-sm"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <item.icon className="size-5" />
              </span>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {featuredCategories.length > 0 && (
        <section className="mx-auto max-w-6xl space-y-6 px-4 py-16">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold tracking-tight">
              {t.public.shopByCategoryTitle}
            </h2>
            <Link
              href="/categories"
              className="text-sm font-medium text-primary hover:underline underline-offset-4"
            >
              {t.public.viewAll}
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
            {featuredCategories.map((category) => (
              <Link
                key={category.id}
                href={`/products?category=${category.slug}`}
                className="group flex flex-col items-center gap-2.5 text-center"
              >
                <div className="relative flex size-16 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary shadow-sm transition-colors group-hover:bg-primary group-hover:text-primary-foreground sm:size-20">
                  {category.imageSecureUrl ? (
                    <Image
                      src={category.imageSecureUrl}
                      alt={category.name}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  ) : (
                    <FolderTree className="size-6" />
                  )}
                </div>
                <span className="line-clamp-1 text-xs font-medium sm:text-sm">
                  {category.name}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl space-y-6 px-4 py-16">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t.public.latestProducts}
          </h2>
          <Link
            href="/products"
            className="text-sm font-medium text-primary hover:underline underline-offset-4"
          >
            {t.public.viewAll}
          </Link>
        </div>
        {featuredProducts.length === 0 ? (
          <EmptyState title={t.public.noProductsYet} />
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {featuredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                outOfStockLabel={t.products.outOfStock}
              />
            ))}
          </div>
        )}
      </section>

      <section className="border-t bg-muted/20">
        <div className="mx-auto max-w-6xl space-y-10 px-4 py-16">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            {t.public.howToOrderTitle}
          </h2>
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
            {HOW_TO_ORDER.map((step, index) => (
              <div key={step.title} className="flex items-center gap-6 sm:contents">
                <div className="flex flex-col items-center gap-3 text-center sm:w-40">
                  <div className="relative flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
                    <step.icon className="size-6" />
                    <span className="absolute -top-2 inset-e-[-0.35rem] flex size-6 items-center justify-center rounded-full border-2 border-background bg-card text-xs font-bold text-foreground">
                      {index + 1}
                    </span>
                  </div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {step.desc}
                  </p>
                </div>
                {index < HOW_TO_ORDER.length - 1 && (
                  <ChevronLeft className="hidden size-5 shrink-0 text-muted-foreground/40 rtl:rotate-180 sm:block sm:self-center" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
