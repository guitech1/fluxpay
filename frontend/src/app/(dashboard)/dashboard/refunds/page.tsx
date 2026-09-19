import Link from "next/link";
import { RefreshCcw } from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard-server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PageHeader, StatusBadge, Table, Mono, EmptyState, ErrorState } from "@/components/dashboard/ui";
import type { Refund } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RefundsPage() {
  const { supabase, environment } = await requireDashboardContext();

  const { data, error } = await supabase
    .from("refunds")
    .select("id, payment_id, amount, currency, status, reason, created_at")
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    .limit(100);

  const refunds = (data || []) as Refund[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reembolsos"
        description="Devoluções solicitadas pelo painel ou pela API"
      />

      {error ? (
        <ErrorState detail={error.message} />
      ) : refunds.length === 0 ? (
        <EmptyState
          icon={RefreshCcw}
          title="Nenhum reembolso ainda"
          description="Reembolsos aparecem aqui depois de solicitados na tela de uma cobrança aprovada."
          action={
            <Link href="/dashboard/payments?status=succeeded" className="btn-secondary">
              Ver cobranças aprovadas
            </Link>
          }
        />
      ) : (
        <Table headers={["ID", "Pagamento", "Valor", "Motivo", "Status", "Data"]}>
          {refunds.map((r) => (
            <tr key={r.id} className="hover:bg-flux-gray/40">
              <td className="px-6 py-4">
                <Mono>{r.id.slice(0, 8)}</Mono>
              </td>
              <td className="px-6 py-4">
                <Mono>{r.payment_id.slice(0, 8)}</Mono>
              </td>
              <td className="px-6 py-4 font-medium">{formatCurrency(r.amount, r.currency)}</td>
              <td className="px-6 py-4 text-flux-muted">{r.reason || "—"}</td>
              <td className="px-6 py-4">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-6 py-4 text-flux-muted whitespace-nowrap">{formatDate(r.created_at)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
