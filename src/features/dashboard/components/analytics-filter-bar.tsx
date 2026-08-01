import Link from "next/link";
import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  RANGE_PRESETS,
  type ResolvedRange,
} from "@/features/dashboard/date-range";

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function AnalyticsFilterBar({
  basePath,
  range,
}: {
  basePath: string;
  range: ResolvedRange;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 ring-1 ring-foreground/10 print:hidden">
      <div className="flex flex-wrap items-center gap-1">
        {RANGE_PRESETS.map((preset) => (
          <Button
            key={preset.value}
            size="sm"
            variant={range.preset === preset.value ? "default" : "ghost"}
            nativeButton={false}
            render={<Link href={`${basePath}?range=${preset.value}`} />}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <Separator />
      <form
        action={basePath}
        method="get"
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="range" value="custom" />
        <div className="flex items-center gap-1 text-muted-foreground">
          <Calendar className="size-3.5" />
          <span className="text-xs">من</span>
        </div>
        <input
          type="date"
          name="from"
          defaultValue={
            range.preset === "custom" && range.from
              ? toDateInputValue(range.from)
              : undefined
          }
          className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <span className="text-xs text-muted-foreground">إلى</span>
        <input
          type="date"
          name="to"
          defaultValue={
            range.preset === "custom" ? toDateInputValue(range.to) : undefined
          }
          className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button
          type="submit"
          size="sm"
          variant={range.preset === "custom" ? "default" : "outline"}
        >
          تطبيق
        </Button>
      </form>
    </div>
  );
}

function Separator() {
  return <div className={cn("mx-1 h-6 w-px bg-border")} />;
}
