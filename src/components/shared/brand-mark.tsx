import Image from "next/image";
import { Store } from "lucide-react";
import { companyConfig } from "@/config/company";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: "size-7", icon: "size-4", px: 28 },
  md: { box: "size-8", icon: "size-4.5", px: 32 },
  lg: { box: "size-9", icon: "size-4.5", px: 36 },
} as const;

/**
 * The app's brand mark — renders the logo from company.ts if one is
 * configured, otherwise falls back to the default icon badge. Shared by
 * the sidebar, public nav, and public footer so there's one place to
 * change how the logo renders.
 */
export function BrandMark({
  size = "md",
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const { box, icon, px } = SIZES[size];

  if (companyConfig.logo) {
    return (
      <Image
        src={companyConfig.logo}
        alt={companyConfig.name}
        width={px}
        height={px}
        className={cn(box, "shrink-0 rounded-lg object-contain", className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm",
        box,
        className,
      )}
    >
      <Store className={icon} />
    </span>
  );
}
