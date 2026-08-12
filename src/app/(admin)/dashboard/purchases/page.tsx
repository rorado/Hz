import Link from "next/link";
import { Plus, ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { getPurchaseOrdersPage } from "@/features/purchases/queries";
import { PurchaseOrdersTable } from "@/features/purchases/components/purchase-orders-table";
import { getDictionary } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const [t, { items, total, pageSize }] = await Promise.all([
    getDictionary(),
    getPurchaseOrdersPage({ page }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.admin.purchases}
        icon={ClipboardList}
        action={
          <Button nativeButton={false} render={<Link href="/dashboard/purchases/new" />}>
            <Plus className="size-4" />
            {t.purchases.addButton}
          </Button>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t.purchases.emptyTitle}
          description={t.purchases.emptyDescription}
        />
      ) : (
        <>
          <PurchaseOrdersTable
            data={items.map((item) => ({
              ...item,
              total: Number(item.total),
              paidAmount: Number(item.paidAmount),
            }))}
          />
          <DataTablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            basePath="/dashboard/purchases"
            searchParams={{}}
          />
        </>
      )}
    </div>
  );
}
