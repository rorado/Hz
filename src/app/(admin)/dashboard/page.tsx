import {
  Package,
  Users,
  ShoppingCart,
  AlertTriangle,
  Wallet,
  Warehouse,
  Receipt,
  TrendingUp,
  UserPlus,
  Truck,
} from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { PageHeader } from "@/components/shared/page-header";
import { ar } from "@/i18n/ar";
import { getDashboardStats } from "@/features/dashboard/queries";
import {
  getAnalyticsSummary,
  getRevenueTrend,
  getOrderStatusBreakdown,
  getPaymentStatusBreakdown,
  getTopProducts,
  getTopCustomers,
  getSalesByCategory,
} from "@/features/dashboard/analytics-queries";
import { resolveDateRange } from "@/features/dashboard/date-range";
import { AnalyticsFilterBar } from "@/features/dashboard/components/analytics-filter-bar";
import { RevenueTrendChart } from "@/features/dashboard/components/revenue-trend-chart";
import { PaymentStatusChart } from "@/features/dashboard/components/payment-status-chart";
import { CategorySalesChart } from "@/features/dashboard/components/category-sales-chart";
import { OrderStatusChart } from "@/features/dashboard/components/order-status-chart";
import { RankedListCard } from "@/features/dashboard/components/ranked-list-card";
import { formatCurrency } from "@/lib/currency";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const range = resolveDateRange(params);

  const [
    stats,
    summary,
    trend,
    orderStatusBreakdown,
    paymentStatusBreakdown,
    topProducts,
    topCustomers,
    categorySales,
  ] = await Promise.all([
    getDashboardStats(),
    getAnalyticsSummary(range),
    getRevenueTrend(range),
    getOrderStatusBreakdown(range),
    getPaymentStatusBreakdown(range),
    getTopProducts(range),
    getTopCustomers(range),
    getSalesByCategory(range),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar.admin.dashboard}
        description="نظرة عامة سريعة على أداء متجرك اليوم"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={ar.dashboardCards.totalProducts}
          value={stats.totalProducts}
          icon={Package}
        />
        <StatCard
          title={ar.dashboardCards.totalCustomers}
          value={stats.totalCustomers}
          icon={Users}
        />
        <StatCard
          title={ar.dashboardCards.orders}
          value={stats.activeOrders}
          icon={ShoppingCart}
        />
        <StatCard
          title={ar.dashboardCards.lowStockProducts}
          value={stats.lowStockCount}
          icon={AlertTriangle}
          variant="warning"
        />
        <StatCard
          title={ar.dashboardCards.totalOwedByCustomers}
          value={stats.totalOwedByCustomers}
          icon={Wallet}
          variant="warning"
          formatValue={(value) => formatCurrency(value)}
        />
        <StatCard
          title={ar.dashboardCards.totalInventoryPurchaseValue}
          value={stats.totalInventoryPurchaseValue}
          icon={Warehouse}
          formatValue={(value) => formatCurrency(value)}
        />
      </div>

      <AnalyticsFilterBar basePath="/dashboard" range={range} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={ar.dashboardCards.periodRevenue}
          value={summary.revenue}
          icon={TrendingUp}
          formatValue={(value) => formatCurrency(value)}
        />
        <StatCard
          title={ar.dashboardCards.periodInvoices}
          value={summary.invoiceCount}
          icon={Receipt}
        />
        <StatCard
          title={ar.dashboardCards.periodOrders}
          value={summary.ordersCount}
          icon={ShoppingCart}
        />
        <StatCard
          title={ar.dashboardCards.avgInvoice}
          value={summary.avgInvoice}
          icon={Wallet}
          formatValue={(value) => formatCurrency(value)}
        />
        <StatCard
          title={ar.dashboardCards.newCustomers}
          value={summary.newCustomers}
          icon={UserPlus}
        />
        <StatCard
          title={ar.dashboardCards.periodPurchases}
          value={summary.purchasesTotal}
          icon={Truck}
          formatValue={(value) => formatCurrency(value)}
        />
      </div>

      <RevenueTrendChart data={trend} />

      <div className="grid gap-4 lg:grid-cols-2">
        <RankedListCard
          title="الأكثر مبيعاً"
          emptyLabel="لا توجد مبيعات في هذه الفترة"
          items={topProducts.map((product) => ({
            key: product.key,
            label: product.name,
            sublabel: `${product.quantity.toLocaleString("ar")} قطعة`,
            value: product.revenue,
          }))}
        />
        <RankedListCard
          title="أفضل العملاء"
          emptyLabel="لا توجد فواتير في هذه الفترة"
          items={topCustomers.map((customer) => ({
            key: customer.id,
            label: customer.name,
            sublabel: `${customer.invoiceCount.toLocaleString("ar")} فاتورة`,
            value: customer.total,
            href: `/dashboard/customers/${customer.id}`,
          }))}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <CategorySalesChart data={categorySales} />
        <PaymentStatusChart data={paymentStatusBreakdown} />
        <OrderStatusChart data={orderStatusBreakdown} />
      </div>
    </div>
  );
}
