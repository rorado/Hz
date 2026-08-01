"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { TrendPoint } from "@/features/dashboard/analytics-queries";
import { formatCurrency } from "@/lib/currency";

const chartConfig = {
  sales: { label: "المبيعات", color: "var(--chart-1)" },
  purchases: { label: "المشتريات", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function RevenueTrendChart({ data }: { data: TrendPoint[] }) {
  const hasData = data.some((d) => d.sales > 0 || d.purchases > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>المبيعات مقابل المشتريات</CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ChartContainer config={chartConfig} className="h-72 w-full">
            <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-sales)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-sales)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="fillPurchases" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-purchases)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-purchases)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={48}
                tickFormatter={(value: number) => value.toLocaleString("ar")}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          {name === "sales" ? "المبيعات" : "المشتريات"}
                        </span>
                        <span className="font-mono font-medium tabular-nums">
                          {formatCurrency(Number(value))}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Area
                dataKey="sales"
                type="monotone"
                fill="url(#fillSales)"
                stroke="var(--color-sales)"
                strokeWidth={2}
              />
              <Area
                dataKey="purchases"
                type="monotone"
                fill="url(#fillPurchases)"
                stroke="var(--color-purchases)"
                strokeWidth={2}
              />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        ) : (
          <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
            لا توجد بيانات لعرضها في هذه الفترة
          </div>
        )}
      </CardContent>
    </Card>
  );
}
