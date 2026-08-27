import { Boxes } from "lucide-react";
import { BackButton } from "@/components/shared/back-button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { getInventoryReportPage } from "@/features/reports/queries";
import { ReportExportButtons } from "@/features/reports/components/report-export-buttons";
import { requirePageAccess } from "@/lib/permissions";
import { getDictionary, getLocale } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function InventoryReportPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePageAccess("REPORTS_VIEW");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const [t, locale, { items: products, total, pageSize }] = await Promise.all([
    getDictionary(),
    getLocale(),
    getInventoryReportPage({ page }),
  ]);

  return (
    <div className="space-y-6" data-report-print>
      <PageHeader
        title={t.reports.inventoryTitle}
        icon={Boxes}
        action={
          <BackButton
            fallbackHref="/dashboard/reports"
            className="print:hidden"
          />
        }
      />
      <ReportExportButtons type="inventory" total={total} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.products.columnName}</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>{t.products.columnCategory}</TableHead>
            <TableHead>{t.products.columnBrand}</TableHead>
            <TableHead>{t.products.columnQuantity}</TableHead>
            <TableHead>{t.reports.columnMinStock}</TableHead>
            <TableHead>{t.common.status}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.id}>
              <TableCell className="font-medium">{product.name}</TableCell>
              <TableCell className="text-muted-foreground">
                <span dir="ltr">{product.sku}</span>
              </TableCell>
              <TableCell>{product.category.name}</TableCell>
              <TableCell>{product.brand?.name ?? "—"}</TableCell>
              <TableCell
                className={
                  product.quantity <= product.minStockLevel
                    ? "font-medium text-destructive"
                    : ""
                }
              >
                {product.quantity.toLocaleString(locale)}
              </TableCell>
              <TableCell>
                {product.minStockLevel.toLocaleString(locale)}
              </TableCell>
              <TableCell>
                <Badge variant={product.status === "ACTIVE" ? "default" : "secondary"}>
                  {t.statusLabels.productStatus[product.status]}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="print:hidden">
        <DataTablePagination
          page={page}
          pageSize={pageSize}
          total={total}
          basePath="/dashboard/reports/inventory"
          searchParams={{}}
        />
      </div>
    </div>
  );
}
