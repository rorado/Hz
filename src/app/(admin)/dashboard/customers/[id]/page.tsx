import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Wallet,
  ShoppingCart,
  Receipt,
  CircleDollarSign,
  FileClock,
  FileX2,
  UserCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { BackButton } from "@/components/shared/back-button";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { getCustomerProfile } from "@/features/customers/queries";
import { OrdersTable } from "@/features/orders/components/orders-table";
import { InvoicesTable } from "@/features/invoices/components/invoices-table";
import { PaymentHistory } from "@/features/invoices/components/payment-history";
import { BalanceHistoryCard } from "@/features/customers/components/balance-history-card";
import { AdjustBalanceDialog } from "@/features/customers/components/adjust-balance-dialog";
import { CustomerStatementForm } from "@/features/customers/components/customer-statement-form";
import { formatCurrency } from "@/lib/currency";
import { requirePageAccess } from "@/lib/permissions";
import { getDictionary, getLocale } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAccess("CUSTOMERS_VIEW");

  const { id } = await params;
  const [t, locale, profile] = await Promise.all([
    getDictionary(),
    getLocale(),
    getCustomerProfile(id),
  ]);
  if (!profile) notFound();

  const { customer, orders, invoices, payments, balanceHistory, totals } =
    profile;

  const partiallyPaidInvoices = invoices.filter(
    (invoice) => invoice.paymentStatus === "PARTIALLY_PAID",
  );
  const unpaidInvoices = invoices.filter(
    (invoice) => invoice.paymentStatus === "UNPAID",
  );
  const remainingOf = (invoice: (typeof invoices)[number]) =>
    Number(invoice.total) - Number(invoice.paidAmount);
  const partiallyPaidRemaining = partiallyPaidInvoices.reduce(
    (sum, invoice) => sum + remainingOf(invoice),
    0,
  );
  const unpaidRemaining = unpaidInvoices.reduce(
    (sum, invoice) => sum + remainingOf(invoice),
    0,
  );
  const totalOutstanding = partiallyPaidRemaining + unpaidRemaining;

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.name}
        icon={UserCircle}
        description={t.customers.profile}
        action={<BackButton fallbackHref="/dashboard/customers" />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title={t.customers.totalPurchased}
          value={totals.totalPurchased}
          icon={ShoppingCart}
          formatValue={(value) => formatCurrency(value, locale)}
        />
        <StatCard
          title={t.customers.totalPaid}
          value={totals.totalPaid}
          icon={Wallet}
          formatValue={(value) => formatCurrency(value, locale)}
        />
        <div className="space-y-2">
          <StatCard
            title={t.customers.balance}
            value={totals.balance}
            icon={Receipt}
            variant="balance"
            formatValue={(value) => formatCurrency(value, locale)}
          />
          <AdjustBalanceDialog
            customerId={customer.id}
            currentBalance={totals.balance}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.customers.outstandingInvoicesTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              title={t.customers.partiallyPaidInvoicesLabel}
              value={partiallyPaidInvoices.length}
              icon={FileClock}
              variant="warning"
            />
            <StatCard
              title={t.customers.unpaidInvoicesLabel}
              value={unpaidInvoices.length}
              icon={FileX2}
              variant="warning"
            />
            <StatCard
              title={t.customers.totalRemainingLabel}
              value={totalOutstanding}
              icon={CircleDollarSign}
              variant="warning"
              formatValue={(value) => formatCurrency(value, locale)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.customers.personalInfo}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">{t.customers.columnName}: </span>
            {customer.name}
          </p>
          <p>
            <span className="text-muted-foreground">{t.orders.phoneLabel}: </span>
            <span dir="ltr">{customer.phone}</span>
          </p>
          {customer.email && (
            <p>
              <span className="text-muted-foreground">{t.orders.emailLabel}: </span>
              <span dir="ltr">{customer.email}</span>
            </p>
          )}
          {customer.address && (
            <p>
              <span className="text-muted-foreground">{t.customers.addressLabel}: </span>
              {customer.address}
            </p>
          )}
          {customer.notes && (
            <p>
              <span className="text-muted-foreground">{t.orders.notesLabel}: </span>
              {customer.notes}
            </p>
          )}
          <p>
            <span className="text-muted-foreground">{t.customers.registeredAtLabel}: </span>
            {new Date(customer.createdAt).toLocaleDateString("fr-FR")}
          </p>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/dashboard/customers?edit=${customer.id}`} />}
          >
            {t.customers.editCustomerInfo}
          </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.customers.statementTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerStatementForm customerId={customer.id} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.customers.ordersHistory}</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <EmptyState icon={ShoppingCart} title={t.customers.noOrders} />
          ) : (
            <OrdersTable
              searchable
              data={orders.map((order) => ({
                id: order.id,
                orderNumber: order.orderNumber,
                total: Number(order.total),
                status: order.status,
                createdAt: order.createdAt,
                customerName: order.customerName,
              }))}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.customers.invoicesHistory}</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <EmptyState icon={Receipt} title={t.customers.noInvoices} />
          ) : (
            <InvoicesTable
              searchable
              data={invoices.map((invoice) => ({
                id: invoice.id,
                sequenceNumber: invoice.sequenceNumber,
                invoiceNumber: invoice.invoiceNumber,
                language: invoice.language,
                customerName: invoice.customerName,
                customerPhone: invoice.customerPhone,
                total: Number(invoice.total),
                paymentStatus: invoice.paymentStatus,
                createdAt: invoice.createdAt,
                _count: { items: invoice.items.length },
                balanceEffectApplied: Number(invoice.balanceEffectApplied),
              }))}
            />
          )}
        </CardContent>
      </Card>

      <PaymentHistory
        payments={payments.map((payment) => ({
          ...payment,
          amount: Number(payment.amount),
        }))}
      />

      <BalanceHistoryCard
        entries={balanceHistory.map((entry) => ({
          id: entry.id,
          invoiceNumber: entry.invoiceNumber,
          previousBalance: Number(entry.previousBalance),
          change: Number(entry.change),
          newBalance: Number(entry.newBalance),
          reason: entry.reason,
          note: entry.note,
          createdAt: entry.createdAt,
        }))}
      />
    </div>
  );
}
