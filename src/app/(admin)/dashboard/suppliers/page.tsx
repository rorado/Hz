import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableSearch } from "@/components/data-table/data-table-search";
import {
  getSuppliersPage,
  getSupplierById,
} from "@/features/suppliers/queries";
import { SuppliersTable } from "@/features/suppliers/components/suppliers-table";
import { SupplierFormSheet } from "@/features/suppliers/components/supplier-form-sheet";
import { getDictionary } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    new?: string;
    edit?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const query = params.q?.trim() || undefined;

  const [t, { items, total, pageSize }, editingSupplier] = await Promise.all([
    getDictionary(),
    getSuppliersPage({ query, page }),
    params.edit ? getSupplierById(params.edit) : Promise.resolve(null),
  ]);

  const isSheetOpen = params.new === "1" || Boolean(params.edit);

  function buildHref(extra: Record<string, string>) {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (page > 1) sp.set("page", String(page));
    for (const [key, value] of Object.entries(extra)) sp.set(key, value);
    return `/dashboard/suppliers?${sp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.admin.suppliers}
        icon={Truck}
        action={
          <Button nativeButton={false} render={<Link href={buildHref({ new: "1" })} />}>
            <Plus className="size-4" />
            {t.suppliers.addButton}
          </Button>
        }
      />
      <DataTableSearch placeholder={t.suppliers.searchPlaceholder} />
      {items.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={t.suppliers.emptyTitle}
          description={t.suppliers.emptyDescription}
        />
      ) : (
        <>
          <SuppliersTable data={items} />
          <DataTablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            basePath="/dashboard/suppliers"
            searchParams={{ q: query }}
          />
        </>
      )}
      <SupplierFormSheet
        key={editingSupplier?.id ?? (params.new ? "new" : "closed")}
        open={isSheetOpen}
        supplier={editingSupplier}
      />
    </div>
  );
}
