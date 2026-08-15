import { AlertTriangle, Boxes } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { EmptyState } from "@/components/shared/empty-state";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { getInventoryMovementsPage } from "@/features/inventory/queries";
import {
  getLowStockProductsPage,
  getProductSelectOptions,
} from "@/features/products/queries";
import { RecordMovementDialog } from "@/features/inventory/components/record-movement-dialog";
import { getDictionary, getLocale } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; lowStockPage?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const lowStockPage = Math.max(1, Number(params.lowStockPage) || 1);

  const [
    t,
    locale,
    { items: lowStockProducts, total: lowStockTotal, pageSize: lowStockPageSize },
    productOptions,
    { items, total, pageSize },
  ] = await Promise.all([
    getDictionary(),
    getLocale(),
    getLowStockProductsPage({ page: lowStockPage }),
    getProductSelectOptions(),
    getInventoryMovementsPage({ page }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.admin.inventory}
        icon={Boxes}
        action={<RecordMovementDialog products={productOptions} />}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive" />
            {t.inventory.lowStockTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lowStockProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t.inventory.lowStockEmpty}
            </p>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.inventory.columnProduct}</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>{t.inventory.columnCurrentQuantity}</TableHead>
                    <TableHead>{t.inventory.columnMinStock}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">
                        {product.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <span dir="ltr">{product.sku}</span>
                      </TableCell>
                      <TableCell className="font-medium text-destructive">
                        {product.quantity.toLocaleString(locale)}
                      </TableCell>
                      <TableCell>
                        {product.minStockLevel.toLocaleString(locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <DataTablePagination
                page={lowStockPage}
                pageSize={lowStockPageSize}
                total={lowStockTotal}
                basePath="/dashboard/inventory"
                pageParam="lowStockPage"
                searchParams={{ page: params.page }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.inventory.movementsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title={t.inventory.movementsEmptyTitle}
              description={t.inventory.movementsEmptyDescription}
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.inventory.columnProduct}</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>{t.inventory.columnType}</TableHead>
                    <TableHead>{t.inventory.columnQuantity}</TableHead>
                    <TableHead>{t.inventory.columnReason}</TableHead>
                    <TableHead>{t.inventory.columnDate}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell>
                        <p className="font-medium">
                          {movement.product?.name ?? "—"}
                        </p>
                      </TableCell>
                      <TableCell dir="ltr" className="text-muted-foreground">
                        {movement.product?.sku ?? movement.productId ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {t.statusLabels.movementType[movement.type]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {movement.quantity.toLocaleString(locale)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {movement.reason ?? "—"}
                      </TableCell>
                      <TableCell>
                        {new Date(movement.createdAt).toLocaleDateString(
                          "fr-FR",
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <DataTablePagination
                page={page}
                pageSize={pageSize}
                total={total}
                basePath="/dashboard/inventory"
                searchParams={{ lowStockPage: params.lowStockPage }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
