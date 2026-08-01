import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/currency";

export function RankedListCard({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: {
    key: string;
    label: string;
    sublabel?: string;
    value: number;
    href?: string;
  }[];
  emptyLabel: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item, index) => {
              const content = (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 truncate font-medium">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {(index + 1).toLocaleString("ar")}.
                      </span>
                      <span className="truncate">{item.label}</span>
                      {item.sublabel && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {item.sublabel}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                      {formatCurrency(item.value)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
                    />
                  </div>
                </div>
              );

              return (
                <li key={item.key}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="block rounded-lg transition-colors hover:bg-muted/50"
                    >
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
