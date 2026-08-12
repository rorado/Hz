import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Wallet,
  ClipboardList,
  Receipt,
  CircleDollarSign,
  FileClock,
  FileX2,
  Truck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { BackButton } from "@/components/shared/back-button";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { getSupplierProfile } from "@/features/suppliers/queries";
import { PurchaseOrdersTable } from "@/features/purchases/components/purchase-orders-table";
import { SupplierPaymentHistory } from "@/features/purchases/components/supplier-payment-history";
import { formatCurrency } from "@/lib/currency";
import { getDictionary, getLocale } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function SupplierProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, locale, profile] = await Promise.all([
    getDictionary(),
    getLocale(),
    getSupplierProfile(id),
  ]);
  if (!profile) notFound();

  const { supplier, purchaseOrders, payments, totals } = profile;

  const partiallyPaidOrders = purchaseOrders.filter(
    (order) => order.paymentStatus === "PARTIALLY_PAID",
  );
  const unpaidOrders = purchaseOrders.filter(
    (order) => order.paymentStatus === "UNPAID",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={supplier.name}
        icon={Truck}
        description={t.suppliers.profileLabel}
        action={<BackButton fallbackHref="/dashboard/suppliers" />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title={t.customers.totalPurchased}
          value={totals.totalPurchased}
          icon={ClipboardList}
          formatValue={(value) => formatCurrency(value, locale)}
        />
        <StatCard
          title={t.customers.totalPaid}
          value={totals.totalPaid}
          icon={Wallet}
          formatValue={(value) => formatCurrency(value, locale)}
        />
        <StatCard
          title={t.customers.totalRemainingLabel}
          value={totals.totalOutstanding}
          icon={Receipt}
          variant="warning"
          formatValue={(value) => formatCurrency(value, locale)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.suppliers.outstandingOrdersTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              title={t.suppliers.partiallyPaidOrdersLabel}
              value={partiallyPaidOrders.length}
              icon={FileClock}
              variant="warning"
            />
            <StatCard
              title={t.suppliers.unpaidOrdersLabel}
              value={unpaidOrders.length}
              icon={FileX2}
              variant="warning"
            />
            <StatCard
              title={t.customers.totalRemainingLabel}
              value={totals.totalOutstanding}
              icon={CircleDollarSign}
              variant="warning"
              formatValue={(value) => formatCurrency(value, locale)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.suppliers.supplierInfoTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">{t.suppliers.nameLabel}: </span>
            {supplier.name}
          </p>
          {supplier.phone && (
            <p>
              <span className="text-muted-foreground">{t.orders.phoneLabel}: </span>
              <span dir="ltr">{supplier.phone}</span>
            </p>
          )}
          {supplier.email && (
            <p>
              <span className="text-muted-foreground">{t.orders.emailLabel}: </span>
              <span dir="ltr">{supplier.email}</span>
            </p>
          )}
          {supplier.address && (
            <p>
              <span className="text-muted-foreground">{t.customers.addressLabel}: </span>
              {supplier.address}
            </p>
          )}
          <p>
            <span className="text-muted-foreground">{t.customers.registeredAtLabel}: </span>
            {new Date(supplier.createdAt).toLocaleDateString("fr-FR")}
          </p>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/dashboard/suppliers?edit=${supplier.id}`} />}
          >
            {t.suppliers.editSupplierInfo}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.suppliers.purchaseOrdersHistoryTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {purchaseOrders.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={t.suppliers.noPurchaseOrdersTitle}
            />
          ) : (
            <PurchaseOrdersTable
              data={purchaseOrders.map((order) => ({
                id: order.id,
                orderNumber: order.orderNumber,
                total: Number(order.total),
                status: order.status,
                paymentStatus: order.paymentStatus,
                createdAt: order.createdAt,
                supplier: { name: supplier.name },
              }))}
            />
          )}
        </CardContent>
      </Card>

      <SupplierPaymentHistory
        payments={payments.map((payment) => ({
          ...payment,
          amount: Number(payment.amount),
        }))}
      />
    </div>
  );
}
