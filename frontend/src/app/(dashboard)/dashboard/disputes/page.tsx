import { requireDashboardContext } from "@/lib/dashboard-server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PageHeader, StatusBadge, Table, Mono, EmptyState, ErrorState } from "@/components/dashboard/ui";
import type { Dispute } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DisputesPage() {
  const { supabase, environment } = await requireDashboardContext();

  const { data, error } = await supabase
    .from("disputes")
    .select("id, payment_id, amount, currency, status, reason, evidence_due_by, created_at")
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    .limit(100);

  const disputes = (data || []) as Dispute[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disputas"
        description="Contestações abertas contra suas cobranças"
      />

      {error ? (
        <ErrorState message={error.message} />
      ) : disputes.length === 0 ? (
        <EmptyState>
          Nenhuma disputa neste ambiente. PIX não tem chargeback, então disputas só aparecem em
          métodos que suportam contestação.
        </EmptyState>
      ) : (
        <Table headers={["ID", "Pagamento", "Valor", "Motivo", "Prazo", "Status", "Aberta em"]}>
          {disputes.map((d) => (
            <tr key={d.id} className="hover:bg-flux-gray/40">
              <td className="px-6 py-4">
                <Mono>{d.id.slice(0, 8)}</Mono>
              </td>
              <td className="px-6 py-4">
                <Mono>{d.payment_id.slice(0, 8)}</Mono>
              </td>
              <td className="px-6 py-4 font-medium">{formatCurrency(d.amount, d.currency)}</td>
              <td className="px-6 py-4 text-flux-muted">{d.reason || "—"}</td>
              <td className="px-6 py-4 text-flux-muted whitespace-nowrap">
                {d.evidence_due_by ? formatDate(d.evidence_due_by) : "—"}
              </td>
              <td className="px-6 py-4">
                <StatusBadge status={d.status} />
              </td>
              <td className="px-6 py-4 text-flux-muted whitespace-nowrap">{formatDate(d.created_at)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
