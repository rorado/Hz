import Link from "next/link";
import { Mail, MapPin, Phone, Globe } from "lucide-react";
import { companyConfig } from "@/config/company";
import { BrandMark } from "@/components/shared/brand-mark";
import {
  FacebookIcon,
  InstagramIcon,
  TwitterIcon,
} from "@/components/shared/social-icons";
import { getDictionary } from "@/i18n/server";

export async function PublicFooter({ logoUrl }: { logoUrl?: string | null }) {
  const t = await getDictionary();
  const { phone, email, address, website } = companyConfig.contact;
  const { facebook, twitter, instagram } = companyConfig.social;
  const hasContactInfo = phone || email || address || website;
  const hasSocial = facebook || twitter || instagram;

  const quickLinks = [
    { href: "/", label: t.publicNav.home },
    { href: "/products", label: t.publicNav.products },
    { href: "/categories", label: t.publicNav.categories },
    { href: "/about", label: t.publicNav.about },
  ];

  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-10 sm:grid-cols-3">
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <BrandMark size="sm" logoUrl={logoUrl} />
              {companyConfig.name}
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              {t.public.footerAboutText}
            </p>
            {hasSocial && (
              <div className="flex items-center gap-2">
                {facebook && (
                  <a
                    href={facebook}
                    target="_blank"
                    rel="noreferrer"
                    title="Facebook"
                    className="flex size-9 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                  >
                    <FacebookIcon className="size-4" />
                  </a>
                )}
                {twitter && (
                  <a
                    href={twitter}
                    target="_blank"
                    rel="noreferrer"
                    title="X (Twitter)"
                    className="flex size-9 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                  >
                    <TwitterIcon className="size-4" />
                  </a>
                )}
                {instagram && (
                  <a
                    href={instagram}
                    target="_blank"
                    rel="noreferrer"
                    title="Instagram"
                    className="flex size-9 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                  >
                    <InstagramIcon className="size-4" />
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              {t.public.footerQuickLinksTitle}
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {hasContactInfo && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">
                {t.public.footerContactTitle}
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {phone && (
                  <li className="flex items-center gap-2">
                    <Phone className="size-4 shrink-0" />
                    <span dir="ltr">{phone}</span>
                  </li>
                )}
                {email && (
                  <li className="flex items-center gap-2">
                    <Mail className="size-4 shrink-0" />
                    <span dir="ltr">{email}</span>
                  </li>
                )}
                {address && (
                  <li className="flex items-center gap-2">
                    <MapPin className="size-4 shrink-0" />
                    <span>{address}</span>
                  </li>
                )}
                {website && (
                  <li className="flex items-center gap-2">
                    <Globe className="size-4 shrink-0" />
                    <a
                      href={
                        website.startsWith("http")
                          ? website
                          : `https://${website}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="transition-colors hover:text-foreground"
                      dir="ltr"
                    >
                      {website}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-10 border-t pt-6 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} {companyConfig.name}.{" "}
          {t.publicNav.allRightsReserved}
        </div>
      </div>
    </footer>
  );
}
