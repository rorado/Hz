"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/locale-provider";
import { companyConfig } from "@/config/company";
import { BrandMark } from "@/components/shared/brand-mark";
import { CartBadge } from "@/features/cart/components/cart-badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function PublicNav({ logoUrl }: { logoUrl?: string | null }) {
  const pathname = usePathname();
  const t = useT();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = [
    { href: "/", label: t.publicNav.home },
    { href: "/products", label: t.publicNav.products },
    { href: "/categories", label: t.publicNav.categories },
    { href: "/about", label: t.publicNav.about },
  ];

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2.5 font-semibold">
          <BrandMark size="md" className="shadow-primary/30" logoUrl={logoUrl} />
          <span className="tracking-tight">{companyConfig.name}</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <div className="hidden items-center gap-1 md:flex">
            {links.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-lg px-3 py-2 font-medium transition-colors",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
          <Link
            href="/cart"
            className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title={t.publicNav.cart}
          >
            <ShoppingCart className="size-5" />
            <CartBadge />
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            className="cursor-pointer md:hidden"
            onClick={() => setMobileOpen(true)}
            title={t.publicNav.menu}
          >
            <Menu className="size-5" />
          </Button>
        </nav>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2.5">
              <BrandMark size="sm" logoUrl={logoUrl} />
              {companyConfig.name}
            </SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 px-4">
            {links.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "rounded-lg px-3 py-2.5 font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}
