"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/currency";
import { formatDateTime } from "@/lib/date";
import { EditPaymentDialog } from "@/features/invoices/components/edit-payment-dialog";
import { PasswordConfirmDeleteDialog } from "@/components/shared/password-confirm-delete-dialog";
import { deletePayment } from "@/features/invoices/actions";
import { useLocale } from "@/i18n/locale-provider";
import { formatMessage } from "@/i18n/format";

type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  note: string | null;
  createdAt: Date;
  invoiceNumber?: string;
};

export function PaymentHistory({ payments }: { payments: PaymentRow[] }) {
  const { t, locale } = useLocale();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.customers.paymentsHistory}</CardTitle>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t.invoices.noPayments}
          </p>
        ) : (
          <ul className="space-y-3 text-sm">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{formatCurrency(payment.amount, locale)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.statusLabels.paymentMethod[
                      payment.method as keyof typeof t.statusLabels.paymentMethod
                    ] ?? payment.method}
                    {payment.invoiceNumber ? ` · ${payment.invoiceNumber}` : ""}
                  </p>
                  {payment.note && (
                    <p className="text-xs text-muted-foreground">
                      {payment.note}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(payment.createdAt)}
                  </p>
                  <EditPaymentDialog
                    paymentId={payment.id}
                    initialAmount={payment.amount}
                    initialMethod={payment.method}
                    initialNote={payment.note}
                  />
                  <PasswordConfirmDeleteDialog
                    action={(password) => deletePayment(payment.id, password)}
                    description={formatMessage(t.invoices.deletePaymentDescription, {
                      amount: formatCurrency(payment.amount, locale),
                    })}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
