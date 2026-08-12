"use client";

import { DataTable } from "@/components/data-table/data-table";
import {
  getPurchaseOrderColumns,
  type PurchaseOrderRow,
} from "@/features/purchases/components/columns";
import { deletePurchaseOrders } from "@/features/purchases/actions";
import { useLocale } from "@/i18n/locale-provider";

export function PurchaseOrdersTable({ data }: { data: PurchaseOrderRow[] }) {
  const { t, locale } = useLocale();

  return (
    <DataTable
      columns={getPurchaseOrderColumns(t, locale)}
      data={data}
      onDeleteSelected={deletePurchaseOrders}
    />
  );
}
