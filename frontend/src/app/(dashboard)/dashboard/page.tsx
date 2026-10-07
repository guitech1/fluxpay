import Link from "next/link";
import { Wallet, Clock, CheckCircle, XCircle, CreditCard, Plus } from "lucide-react";
import { requireDashboardContext, canWrite } from "@/lib/dashboard-server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { OverviewCharts, type DailyPoint } from "@/components/dashboard/OverviewCharts";
import { PageHeader, StatusBadge, Table, Mono, EmptyState } from "@/components/dashboard/ui";
import { ScoreOverviewCard } from "@/components/dashboard/ScoreOverviewCard";
import type { Payment } from "@/lib/types";

export const dynamic = "force-dynamic";

function startOfDayUTC(daysAgo: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ElementType;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const tones = {
    default: "text-flux-muted",
    success: "text-emerald-400",
    warning: "text-amber-400",
    danger: "text-red-400",
  };
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-flux-muted">{label}</span>
        <Icon className={`w-4 h-4 ${tones[tone]}`} />
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="text-xs text-flux-muted mt-1">{hint}</div>}
    </div>
  );
}

export default async function OverviewPage() {
  const { supabase, organization, environment, role } = await requireDashboardContext();
  const write = canWrite(role);

  const since = startOfDayUTC(13).toISOString();

  const [{ data: payments }, { data: balance }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, amount, currency, status, payment_type, created_at, customers(id, name, email)")
      .eq("environment", environment)
      .gte("created_at", since)
      .order("created_at", { ascending: false }),
    supabase.rpc("get_organization_balance", {
      p_organization_id: organization.id,
      p_environment: environment,
    }),
  ]);

  const { data: recent } = await supabase
    .from("payments")
    .select("id, amount, currency, status, payment_type, created_at, customers(id, name, email)")
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    .limit(8);

  const rows = (payments || []) as unknown as Payment[];

  const approved = rows.filter((p) => p.status === "succeeded");
  const pending = rows.filter((p) => p.status === "pending" || p.status === "processing");
  const failed = rows.filter((p) => ["failed", "expired", "canceled"].includes(p.status));

  const approvedTotal = approved.reduce((sum, p) => sum + p.amount, 0);
  const approvalRate = rows.length ? Math.round((approved.length / rows.length) * 100) : 0;

  const series: DailyPoint[] = Array.from({ length: 14 }, (_, i) => {
    const day = startOfDayUTC(13 - i);
    const key = day.toISOString().slice(0, 10);
    const ofDay = rows.filter((p) => p.created_at.slice(0, 10) === key);
    return {
      date: `${key.slice(8, 10)}/${key.slice(5, 7)}`,
      amount: ofDay.filter((p) => p.status === "succeeded").reduce((s, p) => s + p.amount, 0),
      count: ofDay.length,
    };
  });

  const balanceRows = (balance || []) as { currency: string; available: number; pending: number }[];
  const primary = balanceRows[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visao geral"
        description={`${organization.name} · ambiente ${environment === "live" ? "de producao" : "de testes"}`}
        action={
          write ? (
            <Link href="/dashboard/payments/new" className="btn-primary">
              <Plus className="w-4 h-4" />
              Criar cobranca
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Saldo disponivel"
          value={primary ? formatCurrency(primary.available, primary.currency) : formatCurrency(0)}
          hint={primary ? `${formatCurrency(primary.pending, primary.currency)} a liberar` : "Sem movimentacoes"}
          icon={Wallet}
        />
        <MetricCard
          label="Aprovado (14 dias)"
          value={formatCurrency(approvedTotal)}
          hint={`${approved.length} transacoes`}
          icon={CheckCircle}
          tone="success"
        />
        <MetricCard
          label="Pendentes"
          value={String(pending.length)}
          hint="PIX aguardando pagamento"
          icon={Clock}
          tone="warning"
        />
        <MetricCard
          label="Taxa de aprovacao"
          value={`${approvalRate}%`}
          hint={`${failed.length} nao concluidas`}
          icon={XCircle}
          tone={approvalRate >= 80 ? "success" : "danger"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <OverviewCharts data={series} />
        </div>
        <div>
          <h2 className="font-medium mb-3">FluxPay Score</h2>
          <ScoreOverviewCard />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Ultimas transacoes</h2>
          <Link href="/dashboard/payments" className="text-sm text-flux-red hover:underline">
            Ver todas
          </Link>
        </div>

        {(recent || []).length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="Nenhuma transacao ainda"
            description="Assim que voce gerar a primeira cobranca PIX, ela aparece aqui com o status atualizado automaticamente."
            action={
              write ? (
                <Link href="/dashboard/payments/new" className="btn-primary">
                  <Plus className="w-4 h-4" />
                  Criar cobranca
                </Link>
              ) : undefined
            }
          />
        ) : (
          <Table headers={["ID", "Cliente", "Valor", "Metodo", "Status", "Data"]}>
            {((recent || []) as unknown as Payment[]).map((p) => (
              <tr key={p.id} className="hover:bg-flux-gray/40">
                <td className="px-6 py-4">
                  <Mono>{p.id.slice(0, 8)}</Mono>
                </td>
                <td className="px-6 py-4">
                  {p.customers?.name || p.customers?.email || (
                    <span className="text-flux-muted">—</span>
                  )}
                </td>
                <td className="px-6 py-4 font-medium">{formatCurrency(p.amount, p.currency)}</td>
                <td className="px-6 py-4 uppercase text-flux-muted text-xs">
                  {p.payment_type || "—"}
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={p.status} />
                </td>
                <td className="px-6 py-4 text-flux-muted">{formatDate(p.created_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}
