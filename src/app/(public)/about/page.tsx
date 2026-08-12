import Link from "next/link";
import Image from "next/image";
import {
  Package,
  Users,
  Calendar,
  Building2,
  ShieldCheck,
  Headphones,
  Clock,
  BadgePercent,
} from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatMessage } from "@/i18n/format";
import { companyConfig } from "@/config/company";
import { getPublicProductsPage } from "@/features/products/queries";
import { getCustomerCount } from "@/features/customers/queries";

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const [t, locale, { total: totalProducts }, totalCustomers] = await Promise.all([
    getDictionary(),
    getLocale(),
    getPublicProductsPage({ page: 1 }),
    getCustomerCount(),
  ]);

  const FEATURES = [
    {
      icon: ShieldCheck,
      title: t.public.aboutFeatureQualityTitle,
      desc: t.public.aboutFeatureQualityDesc,
    },
    {
      icon: Headphones,
      title: t.public.aboutFeatureServiceTitle,
      desc: t.public.aboutFeatureServiceDesc,
    },
    {
      icon: Clock,
      title: t.public.aboutFeatureResponseTitle,
      desc: t.public.aboutFeatureResponseDesc,
    },
    {
      icon: BadgePercent,
      title: t.public.aboutFeaturePriceTitle,
      desc: t.public.aboutFeaturePriceDesc,
    },
  ];

  const STATS = [
    { value: totalProducts, label: t.public.statProductsLabel, icon: Package },
    { value: totalCustomers, label: t.public.statCustomersLabel, icon: Users },
    {
      value: companyConfig.about.yearsExperience,
      label: t.public.statYearsLabel,
      icon: Calendar,
    },
    {
      value: companyConfig.about.partnersCount,
      label: t.public.statPartnersLabel,
      icon: Building2,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-10">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>
              {t.public.breadcrumbHome}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t.publicNav.about}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {t.publicNav.about}
            </h1>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              <p>
                {formatMessage(t.public.aboutIntro1Template, {
                  company: companyConfig.name,
                })}
              </p>
              <p>{t.public.aboutIntro2}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="flex flex-col items-start gap-2 rounded-xl border bg-card p-4 shadow-sm"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <feature.icon className="size-4.5" />
                </span>
                <p className="text-sm font-semibold">{feature.title}</p>
                <p className="text-xs text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div
            aria-hidden
            className="absolute -top-6 inset-e-[-1.5rem] -z-10 size-32 opacity-40 [background-image:radial-gradient(var(--color-primary)_1.5px,transparent_1.5px)] [background-size:14px_14px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
          />
          <div className="relative aspect-square overflow-hidden rounded-3xl border bg-card shadow-lg">
            <Image
              src="/cart.jpg"
              alt={companyConfig.name}
              fill
              className="object-cover"
              sizes="(min-width: 1024px) 45vw, 90vw"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-4">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col items-center gap-1.5 bg-primary/5 px-4 py-7 text-center"
          >
            <stat.icon className="size-5 text-primary" />
            <p className="text-2xl font-bold tabular-nums text-primary" dir="ltr">
              +{stat.value.toLocaleString(locale)}
            </p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
