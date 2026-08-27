import Link from "next/link";
import { RotateCcw, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTableSearch } from "@/components/data-table/data-table-search";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { getSalesReturnsPage } from "@/features/returns/queries";
import { formatCurrency } from "@/lib/currency";
import { requirePageAccess } from "@/lib/permissions";
import { getDictionary, getLocale } from "@/i18n/server";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  await requirePageAccess("RETURNS_VIEW");
  const p = await searchParams; const page = Math.max(1, Number(p.page) || 1); const query = p.q?.trim();
  const [{ items, total, pageSize },t,locale] = await Promise.all([getSalesReturnsPage({ query, page }),getDictionary(),getLocale()]);
  const statuses={PENDING:t.returns.pending,COMPLETED:t.returns.completed,CREDITED:t.returns.credited,NOT_REQUIRED:t.returns.notRequired};
  return <div className="space-y-6"><PageHeader title={t.returns.salesTitle} description={t.returns.salesDescription} icon={RotateCcw} action={<Button nativeButton={false} render={<Link href="/dashboard/sales-returns/new" />}><Plus className="size-4" />{t.returns.newReturn}</Button>} /><DataTableSearch placeholder={t.returns.salesSearch} />
    <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted/50"><tr>{[t.returns.returnNumber,t.returns.invoice,t.returns.customer,t.returns.date,t.returns.items,t.returns.amount,t.returns.status,t.returns.employee].map(h=><th key={h} className="p-3 text-start">{h}</th>)}</tr></thead><tbody>{items.map(r=><tr key={r.id} className="border-t"><td className="p-3 font-medium"><Link className="hover:underline" href={`/dashboard/sales-returns/${r.id}`}>{r.returnNumber}</Link></td><td className="p-3">{r.invoice.invoiceNumber}</td><td className="p-3">{r.invoice.customerName}</td><td className="p-3">{r.createdAt.toLocaleDateString(locale)}</td><td className="p-3">{r._count.items}</td><td className="p-3">{formatCurrency(Number(r.refundAmount),locale)}</td><td className="p-3"><Badge>{statuses[r.refundStatus]}</Badge></td><td className="p-3">{r.createdBy.name}</td></tr>)}</tbody></table></div>
    <DataTablePagination page={page} pageSize={pageSize} total={total} basePath="/dashboard/sales-returns" searchParams={{q:query}} /></div>;
}
