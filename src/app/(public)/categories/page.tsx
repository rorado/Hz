import Link from "next/link";
import Image from "next/image";
import { FolderTree } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getPublicCategoriesWithCounts } from "@/features/categories/queries";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatMessage } from "@/i18n/format";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const [t, locale, categories] = await Promise.all([
    getDictionary(),
    getLocale(),
    getPublicCategoriesWithCounts(),
  ]);

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
            <BreadcrumbPage>{t.publicNav.categories}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">{t.publicNav.categories}</h1>
        <p className="text-sm text-muted-foreground">
          {categories.length.toLocaleString(locale)} {t.public.statCategoriesLabel}
        </p>
      </div>

      {categories.length === 0 ? (
        <EmptyState icon={FolderTree} title={t.public.noCategoriesYet} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/products?category=${category.slug}`}
              className="group flex flex-col items-center gap-3 rounded-2xl border bg-card p-6 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
            >
              <div className="relative flex size-16 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                {category.imageSecureUrl ? (
                  <Image
                    src={category.imageSecureUrl}
                    alt={category.name}
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                ) : (
                  <FolderTree className="size-8" />
                )}
              </div>
              <span className="font-medium">{category.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatMessage(t.public.productCountTemplate, {
                  count: category._count.products.toLocaleString(locale),
                })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
