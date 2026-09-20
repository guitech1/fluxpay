import Link from "next/link";
import { Plus } from "lucide-react";
import { requireDashboardContext, canWrite } from "@/lib/dashboard-server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PageHeader, StatusBadge, Table, Mono, EmptyState, ErrorState } from "@/components/dashboard/ui";
import { PaymentActions } from "@/components/dashboard/PaymentActions";
import type { Payment } from "@/lib/types";

export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "all", label: "Todos os status" },
  { value: "succeeded", label: "Aprovados" },
  { value: "pending", label: "Pendentes" },
  { value: "failed", label: "Recusados" },
  { value: "expired", label: "Expirados" },
  { value: "refunded", label: "Reembolsados" },
];

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { supabase, environment, role } = await requireDashboardContext();
  const { status } = await searchParams;
  const write = canWrite(role);

  let query = supabase
    .from("payments")
    .select(
      "id, amount, currency, status, payment_type, provider, provider_txid, fee_amount, net_amount, description, created_at, paid_at, expires_at, customers(id, name, email)"
    )
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    .limit(100);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  const payments = (data || []) as unknown as Payment[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagamentos"
        description="Todas as transações do ambiente selecionado (100 mais recentes)"
        action={
          <div className="flex flex-col items-end gap-3">
            {write && (
              <Link href="/dashboard/payments/new" className="btn-primary">
                <Plus className="w-4 h-4" />
                Criar cobrança
              </Link>
            )}
            <div className="flex flex-wrap gap-1.5 justify-end">
              {FILTERS.map((f) => {
                const active = (status || "all") === f.value;
                return (
                  <Link
                    key={f.value}
                    href={f.value === "all" ? "/dashboard/payments" : `/dashboard/payments?status=${f.value}`}
                    className={
                      active
                        ? "px-3 py-1.5 rounded-lg text-xs font-medium bg-flux-red/10 text-flux-red border border-flux-red/20"
                        : "px-3 py-1.5 rounded-lg text-xs font-medium text-flux-muted border border-flux-border hover:text-white"
                    }
                  >
                    {f.label}
                  </Link>
                );
              })}
            </div>
          </div>
        }
      />

      {error ? (
        <ErrorState detail={error.message} />
      ) : payments.length === 0 ? (
        <EmptyState
          title="Nenhuma transação ainda"
          description={
            write
              ? "Gere a primeira cobrança PIX pelo painel ou via API com uma chave sk_ do ambiente selecionado."
              : "Quando houver cobranças neste ambiente, elas aparecem aqui."
          }
          action={
            write ? (
              <Link href="/dashboard/payments/new" className="btn-primary">
                <Plus className="w-4 h-4" />
                Criar cobrança
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Table headers={["ID", "Cliente", "Valor", "Taxa", "Método", "Status", "Data", ""]}>
          {payments.map((p) => (
            <tr key={p.id} className="hover:bg-flux-gray/40 align-middle">
              <td className="px-6 py-4">
                <Link href={`/dashboard/payments/${p.id}`} className="hover:underline">
                  <Mono>{p.id.slice(0, 8)}</Mono>
                </Link>
                {p.provider_txid && (
                  <div className="text-[11px] text-flux-muted mt-0.5">txid {p.provider_txid}</div>
                )}
              </td>
              <td className="px-6 py-4">
                {p.customers?.name || p.customers?.email || <span className="text-flux-muted">—</span>}
                {p.description && (
                  <div className="text-xs text-flux-muted truncate max-w-[220px]">{p.description}</div>
                )}
              </td>
              <td className="px-6 py-4 font-medium whitespace-nowrap">
                {formatCurrency(p.amount, p.currency)}
              </td>
              <td className="px-6 py-4 text-flux-muted whitespace-nowrap">
                {p.fee_amount ? formatCurrency(p.fee_amount, p.currency) : "—"}
              </td>
              <td className="px-6 py-4 uppercase text-xs text-flux-muted">{p.payment_type || "—"}</td>
              <td className="px-6 py-4">
                <StatusBadge status={p.status} />
              </td>
              <td className="px-6 py-4 text-flux-muted whitespace-nowrap">
                {formatDate(p.created_at)}
              </td>
              <td className="px-6 py-4 text-right">
                <PaymentActions
                  paymentId={p.id}
                  status={p.status}
                  amount={p.amount}
                  currency={p.currency}
                  canWrite={write}
                  canSimulate={environment === "test" && p.provider === "sandbox"}
                />
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
