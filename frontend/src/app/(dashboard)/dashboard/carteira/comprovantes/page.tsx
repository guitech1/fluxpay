import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard-server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PageHeader, EmptyState, Table, Mono } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

export default async function ComprovantesPage() {
  const { supabase, organization, environment } = await requireDashboardContext();

  const { data: withdrawals } = await supabase
    .from("withdrawal_requests")
    .select("id, net, fee, amount, currency, status, pix_key_type, created_at, provider_reference")
    .eq("organization_id", organization.id)
    .eq("environment", environment)
    .in("status", ["completed", "processing", "failed", "rejected", "pending"])
    .order("created_at", { ascending: false })
    .limit(30);

  const rows = withdrawals || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/carteira"
          className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <PageHeader
          title="Comprovantes"
          description="Saques e transferências Pix registrados no ledger"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum comprovante ainda"
          description="Quando um saque for confirmado pelo provedor, ele aparece aqui com status real."
        />
      ) : (
        <Table headers={["Data", "Status", "Líquido", "Taxa", "Ref."]}>
          {rows.map((w: any) => (
            <tr key={w.id} className="hover:bg-flux-gray/40">
              <td className="px-5 py-3 text-flux-muted whitespace-nowrap">{formatDate(w.created_at)}</td>
              <td className="px-5 py-3">
                <span className="text-sm font-medium">{w.status}</span>
              </td>
              <td className="px-5 py-3 text-right font-medium">
                {formatCurrency(w.net, w.currency || "BRL")}
              </td>
              <td className="px-5 py-3 text-right text-flux-muted">
                {formatCurrency(w.fee || 0, w.currency || "BRL")}
              </td>
              <td className="px-5 py-3">
                <Mono>{(w.provider_reference || w.id).slice(0, 12)}</Mono>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
