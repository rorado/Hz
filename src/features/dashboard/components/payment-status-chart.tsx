"use client";

import { Cell, Pie, PieChart } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { StatusBreakdown } from "@/features/dashboard/analytics-queries";
import { PAYMENT_STATUS_LABELS } from "@/features/invoices/schema";
import { formatCurrency } from "@/lib/currency";

const COLORS: Record<string, string> = {
  PAID: "var(--chart-5)",
  PARTIALLY_PAID: "var(--chart-3)",
  UNPAID: "var(--destructive)",
};

export function PaymentStatusChart({ data }: { data: StatusBreakdown[] }) {
  const chartData = data.map((d) => ({
    status: d.status,
    label: PAYMENT_STATUS_LABELS[d.status] ?? d.status,
    count: d.count,
    total: d.total,
  }));

  const chartConfig = Object.fromEntries(
    chartData.map((d) => [d.status, { label: d.label, color: COLORS[d.status] }]),
  ) satisfies ChartConfig;

  const hasData = chartData.some((d) => d.count > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>حالة الدفع للفواتير</CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ChartContainer config={chartConfig} className="mx-auto h-64 w-full">
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="status"
                    formatter={(value, name, item) => (
                      <div className="flex w-full flex-col gap-0.5">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">
                            {chartConfig[name as keyof typeof chartConfig]?.label ?? name}
                          </span>
                          <span className="font-mono font-medium tabular-nums">
                            {item.payload.count.toLocaleString("ar")} فاتورة
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-muted-foreground">الإجمالي</span>
                          <span className="font-mono font-medium tabular-nums">
                            {formatCurrency(Number(value))}
                          </span>
                        </div>
                      </div>
                    )}
                  />
                }
              />
              <Pie
                data={chartData}
                dataKey="total"
                nameKey="status"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
                strokeWidth={2}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.status} fill={COLORS[entry.status] ?? "var(--chart-2)"} />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="status" />} />
            </PieChart>
          </ChartContainer>
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            لا توجد فواتير في هذه الفترة
          </div>
        )}
      </CardContent>
    </Card>
  );
}
