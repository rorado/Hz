import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildCsv, buildXlsx } from "@/lib/report-export";
import {
  getInventoryReportData,
  getProductsReportData,
  getOrdersReportData,
  getCustomersReportData,
  getPurchasesReportData,
  getSuppliersReportData,
} from "@/features/reports/queries";
import { getDictionary, getLocale } from "@/i18n/server";
import type { Dictionary } from "@/i18n/dictionaries";
import { CURRENCY_LABEL } from "@/lib/currency";

type ReportPayload = { headers: string[]; rows: (string | number)[][] };

const REPORT_BUILDERS: Record<
  string,
  (t: Dictionary, currency: string, limit?: number) => Promise<ReportPayload>
> = {
  inventory: async (t, _currency, limit) => {
    const products = await getInventoryReportData(limit);
    return {
      headers: [
        t.products.columnName,
        "SKU",
        t.products.columnCategory,
        t.products.columnBrand,
        t.products.columnQuantity,
        t.reports.columnMinStock,
        t.common.status,
      ],
      rows: products.map((product) => [
        product.name,
        product.sku,
        product.category.name,
        product.brand?.name ?? "",
        product.quantity,
        product.minStockLevel,
        t.statusLabels.productStatus[product.status],
      ]),
    };
  },
  products: async (t, _currency, limit) => {
    const products = await getProductsReportData(limit);
    return {
      headers: [
        t.products.columnName,
        "SKU",
        t.categories.columnSlug,
        t.products.columnCategory,
        t.products.columnBrand,
        t.products.columnQuantity,
        t.reports.columnMinStock,
        t.reports.columnPrice1,
        t.reports.columnPrice2,
        t.reports.columnPrice3,
        t.products.purchasePriceDisplayLabel,
        t.products.weightDisplayLabel,
        t.products.barcodeColumnLabel,
        t.products.descriptionLabel,
        t.common.status,
        t.reports.columnImages,
      ],
      rows: products.map((product) => [
        product.name,
        product.sku,
        product.slug,
        product.category.name,
        product.brand?.name ?? "",
        product.quantity,
        product.minStockLevel,
        Number(product.price1),
        Number(product.price2),
        Number(product.price3),
        Number(product.purchasePrice),
        Number(product.weight ?? 0),
        product.barcode ?? "",
        product.description ?? "",
        t.statusLabels.productStatus[product.status],
        product.images.map((image) => image.secureUrl).join(", "),
      ]),
    };
  },
  orders: async (t, currency, limit) => {
    const orders = await getOrdersReportData(limit);
    return {
      headers: [
        t.reports.columnOrderNumber,
        t.reports.columnCustomer,
        t.reports.columnPhone,
        `${t.reports.columnTotal} (${currency})`,
        t.common.status,
        t.reports.columnDate,
      ],
      rows: orders.map((order) => [
        order.orderNumber,
        order.customerName,
        order.customerPhone,
        Number(order.total),
        t.statusLabels.order[order.status],
        order.createdAt.toISOString().slice(0, 10),
      ]),
    };
  },
  customers: async (t, currency, limit) => {
    const customers = await getCustomersReportData(limit);
    return {
      headers: [
        t.reports.columnName,
        t.reports.columnPhone,
        t.reports.columnEmail,
        t.reports.columnOrdersCount,
        `${t.reports.columnTotalPurchases} (${currency})`,
      ],
      rows: customers.map((customer) => [
        customer.name,
        customer.phone,
        customer.email ?? "",
        customer.ordersCount,
        customer.totalSpent,
      ]),
    };
  },
  purchases: async (t, currency, limit) => {
    const purchases = await getPurchasesReportData(limit);
    return {
      headers: [
        t.reports.columnPurchaseOrderNumber,
        t.reports.columnSupplier,
        t.common.status,
        `${t.reports.columnTotal} (${currency})`,
        t.reports.columnCreatedDate,
        t.reports.columnReceivedDate,
      ],
      rows: purchases.map((order) => [
        order.orderNumber,
        order.supplier.name,
        t.statusLabels.purchaseOrder[order.status],
        Number(order.total),
        order.createdAt.toISOString().slice(0, 10),
        order.receivedAt ? order.receivedAt.toISOString().slice(0, 10) : "",
      ]),
    };
  },
  suppliers: async (t, currency, limit) => {
    const suppliers = await getSuppliersReportData(limit);
    return {
      headers: [
        t.reports.columnName,
        t.reports.columnPhone,
        t.reports.columnEmail,
        t.reports.columnAddress,
        t.reports.columnPurchaseOrdersCount,
        `${t.reports.columnTotalPurchasedFromSupplier} (${currency})`,
      ],
      rows: suppliers.map((supplier) => [
        supplier.name,
        supplier.phone ?? "",
        supplier.email ?? "",
        supplier.address ?? "",
        supplier.ordersCount,
        supplier.totalPurchased,
      ]),
    };
  },
};

export async function GET(request: NextRequest) {
  const [session, t, locale] = await Promise.all([auth(), getDictionary(), getLocale()]);
  if (!session?.user) {
    return NextResponse.json({ error: t.reports.unauthorizedError }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type") ?? "";
  const format = searchParams.get("format") ?? "csv";
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined;

  const builder = REPORT_BUILDERS[type];
  if (!builder) {
    return NextResponse.json({ error: t.reports.invalidReportTypeError }, { status: 400 });
  }

  const currency = CURRENCY_LABEL[locale as keyof typeof CURRENCY_LABEL] ?? CURRENCY_LABEL.ar;
  const payload = await builder(t, currency, limit);
  const requestedColumns = searchParams
    .get("columns")
    ?.split(",")
    .map(Number)
    .filter(
      (index) =>
        Number.isInteger(index) && index >= 0 && index < payload.headers.length,
    );
  const columnIndexes =
    requestedColumns && requestedColumns.length > 0
      ? Array.from(new Set(requestedColumns))
      : payload.headers.map((_, index) => index);
  const headers = columnIndexes.map((index) => payload.headers[index]);
  const rows = payload.rows.map((row) =>
    columnIndexes.map((index) => row[index]),
  );

  if (format === "json") {
    return NextResponse.json({ headers, rows });
  }

  if (format === "xlsx") {
    const buffer = await buildXlsx(type, headers, rows);
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${type}.xlsx"`,
      },
    });
  }

  const csv = buildCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}.csv"`,
    },
  });
}
