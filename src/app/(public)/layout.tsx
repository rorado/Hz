import { PublicNav } from "@/components/layout/public-nav";
import { PublicFooter } from "@/components/layout/public-footer";
import { getSystemSettings } from "@/features/settings/queries";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { logoUrl } = await getSystemSettings();

  return (
    <div className="flex min-h-svh flex-col">
      <PublicNav logoUrl={logoUrl} />
      <main className="flex-1">{children}</main>
      <PublicFooter logoUrl={logoUrl} />
    </div>
  );
}
