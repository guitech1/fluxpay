import { notFound } from "next/navigation";
import Link from "next/link";
import { requireDashboardContext, canWrite } from "@/lib/dashboard-server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { paymentTypeLabel } from "@/lib/labels";
import { PageHeader, StatusBadge, DetailRow, SectionTitle } from "@/components/dashboard/ui";
import { CopyButton } from "@/components/dashboard/ui-client";
import { PixChargePanel } from "@/components/dashboard/PixChargePanel";
import { PaymentActions } from "@/components/dashboard/PaymentActions";
import type { Payment, Refund } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PaymentDetail extends Payment {
  pix_copy_paste: string | null;
  pix_qr_code_base64: string | null;
  metadata: Record<string, unknown> | null;
}

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, environment, role } = await requireDashboardContext();

  // Sem filtro por empresa na consulta: a política do banco já limita a
  // leitura à organização do usuário. Um ID de outra conta simplesmente não
  // retorna linha nenhuma — e cai no 404 abaixo.
  const { data } = await supabase
    .from("payments")
    .select(
      "id, amount, currency, status, payment_type, provider, provider_txid, provider_external_id, fee_amount, net_amount, description, created_at, paid_at, expires_at, pix_copy_paste, pix_qr_code_base64, metadata, customers(id, name, email)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  const payment = data as unknown as PaymentDetail;

  const { data: refundRows } = await supabase
    .from("refunds")
    .select("id, payment_id, amount, currency, status, reason, created_at")
    .eq("payment_id", id)
    .order("created_at", { ascending: false });

  const refunds = (refundRows || []) as Refund[];
  const isPix = payment.payment_type === "pix";
  const isSimulated = environment === "test" && payment.provider === "sandbox";

  return (
    <div className="space-y-6">
      <PageHeader
        title={formatCurrency(payment.amount, payment.currency)}
        description={payment.description || "Cobrança sem descrição"}
        backHref="/dashboard/payments"
        backLabel="Pagamentos"
        action={
          <div className="flex items-center gap-3">
            <StatusBadge status={payment.status} />
            <PaymentActions
              paymentId={payment.id}
              status={payment.status}
              amount={payment.amount}
              currency={payment.currency}
              canWrite={canWrite(role)}
              canSimulate={false}
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {isPix && (
          <div className="lg:col-span-1 lg:order-2">
            <PixChargePanel
              paymentId={payment.id}
              initialStatus={payment.status}
              amount={payment.amount}
              currency={payment.currency}
              copyPaste={payment.pix_copy_paste}
              qrCodeBase64={payment.pix_qr_code_base64}
              expiresAt={payment.expires_at}
              isSimulated={isSimulated}
              canWrite={canWrite(role)}
            />
          </div>
        )}

        <div className={isPix ? "lg:col-span-2 lg:order-1 space-y-6" : "lg:col-span-3 space-y-6"}>
          <div className="card">
            <h2 className="font-medium mb-2">Detalhes</h2>
            <dl>
              <DetailRow label="Identificador" mono>
                <span className="inline-flex items-center gap-1">
                  {payment.id}
                  <CopyButton value={payment.id} iconOnly label="Copiar identificador" />
                </span>
              </DetailRow>
              <DetailRow label="Status">
                <StatusBadge status={payment.status} />
              </DetailRow>
              <DetailRow label="Método">{paymentTypeLabel(payment.payment_type)}</DetailRow>
              <DetailRow label="Valor">{formatCurrency(payment.amount, payment.currency)}</DetailRow>
              <DetailRow label="Taxa">
                {payment.fee_amount ? formatCurrency(payment.fee_amount, payment.currency) : "—"}
              </DetailRow>
              <DetailRow label="Valor líquido">
                {payment.net_amount != null
                  ? formatCurrency(payment.net_amount, payment.currency)
                  : "—"}
              </DetailRow>
              <DetailRow label="Cliente">
                {payment.customers ? (
                  <Link href="/dashboard/customers" className="hover:underline">
                    {payment.customers.name || payment.customers.email}
                  </Link>
                ) : (
                  <span className="text-flux-muted">Não vinculado</span>
                )}
              </DetailRow>
              <DetailRow label="Sua referência" mono>
                {payment.provider_external_id || <span className="font-sans text-flux-muted">—</span>}
              </DetailRow>
              <DetailRow label="Identificador da transação" mono>
                {payment.provider_txid || <span className="font-sans text-flux-muted">—</span>}
              </DetailRow>
              <DetailRow label="Criada em">{formatDate(payment.created_at)}</DetailRow>
              {payment.expires_at && (
                <DetailRow label="Expira em">{formatDate(payment.expires_at)}</DetailRow>
              )}
              {payment.paid_at && (
                <DetailRow label="Paga em">{formatDate(payment.paid_at)}</DetailRow>
              )}
            </dl>
          </div>

          {refunds.length > 0 && (
            <div>
              <SectionTitle title="Reembolsos" />
              <div className="card divide-y divide-flux-border p-0">
                {refunds.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm"
                  >
                    <div>
                      <p className="font-medium">{formatCurrency(r.amount, r.currency)}</p>
                      <p className="text-xs text-flux-muted mt-0.5">
                        {r.reason || "Sem motivo informado"} · {formatDate(r.created_at)}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
