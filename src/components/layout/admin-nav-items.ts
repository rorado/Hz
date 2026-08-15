import {
  LayoutDashboard,
  Package,
  FolderTree,
  Tags,
  Users,
  ShoppingCart,
  Boxes,
  Truck,
  ClipboardList,
  Receipt,
  BarChart3,
  FileText,
  RotateCcw,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";

export type AdminNavBadgeKey = "pendingOrders" | "lowStock" | "unpaidInvoices";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: AdminNavBadgeKey;
};

export type AdminNavGroup = {
  label?: string;
  items: AdminNavItem[];
};

export function getAdminNavGroups(t: Dictionary): AdminNavGroup[] {
  return [
    {
      items: [
        { href: "/dashboard", label: t.admin.dashboard, icon: LayoutDashboard },
      ],
    },
    {
      label: t.admin.groups.catalog,
      items: [
        { href: "/dashboard/products", label: t.admin.products, icon: Package },
        {
          href: "/dashboard/categories",
          label: t.admin.categories,
          icon: FolderTree,
        },
        { href: "/dashboard/brands", label: t.admin.brands, icon: Tags },
      ],
    },
    {
      label: t.admin.groups.sales,
      items: [
        { href: "/dashboard/customers", label: t.admin.customers, icon: Users },
        {
          href: "/dashboard/orders",
          label: t.admin.orders,
          icon: ShoppingCart,
          badgeKey: "pendingOrders",
        },
        {
          href: "/dashboard/invoices",
          label: t.admin.invoices,
          icon: FileText,
          badgeKey: "unpaidInvoices",
        },
        { href: "/dashboard/sales-returns", label: t.returns.salesTitle, icon: RotateCcw },
      ],
    },
    {
      label: t.admin.groups.inventory,
      items: [
        {
          href: "/dashboard/inventory",
          label: t.admin.inventory,
          icon: Boxes,
          badgeKey: "lowStock",
        },
        { href: "/dashboard/suppliers", label: t.admin.suppliers, icon: Truck },
        {
          href: "/dashboard/purchases",
          label: t.admin.purchases,
          icon: ClipboardList,
        },
        { href: "/dashboard/purchase-returns", label: t.returns.purchaseTitle, icon: Undo2 },
      ],
    },
    {
      label: t.admin.groups.finance,
      items: [
        { href: "/dashboard/expenses", label: t.admin.expenses, icon: Receipt },
        { href: "/dashboard/reports", label: t.admin.reports, icon: BarChart3 },
      ],
    },
  ];
}
