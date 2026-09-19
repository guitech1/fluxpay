import Link from "next/link";
import { Wallet, ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard-server";
import { WithdrawForm } from "@/components/dashboard/WithdrawForm";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  PageHeader,
  SectionTitle,
  Table,
  Mono,
  EmptyState,
  ErrorState,
  Pagination,
} from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const TX_LABELS: Record<string, string> = {
  charge: "Cobrança recebida",
  refund: "Reembolso",
  fee: "Taxa",
  payout: "Saque",
  adjustment: "Ajuste",
};

interface BalanceTransaction {
  id: string;
  type: string;
  amount: number;
  net: number;
  fee: number | null;
  currency: string;
  description: string | null;
  payment_id: string | null;
  available_on: string | null;
  created_at: string;
}

function BalanceCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ElementType;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-flux-muted">{label}</span>
        <Icon className="w-4 h-4 text-flux-muted" />
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-xs text-flux-muted mt-1">{hint}</div>
    </div>
  );
}

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { supabase, organization, environment, role: membershipRole } = await requireDashboardContext();
  const params = await searchParams;

  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const [{ data: balance }, { data: txData, error }] = await Promise.all([
    supabase.rpc("get_organization_balance", {
      p_organization_id: organization.id,
      p_environment: environment,
    }),
    supabase
      .from("balance_transactions")
      .select("id, type, amount, net, fee, currency, description, payment_id, available_on, created_at")
      .eq("environment", environment)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE),
  ]);

  const all = (txData || []) as BalanceTransaction[];
  const hasMore = all.length > PAGE_SIZE;
  const transactions = all.slice(0, PAGE_SIZE);

  const balances = (balance || []) as { currency: string; available: number; pending: number }[];
  const primary = balances[0];
  const currency = primary?.currency || organization.default_currency || "BRL";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Carteira"
        description="Saldo da conta e histórico de movimentações no ambiente selecionado"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <BalanceCard
          label="Disponível"
          value={formatCurrency(primary?.available ?? 0, currency)}
          hint="Liberado no extrato — use o formulário abaixo para sacar"
          icon={Wallet}
        />
        <BalanceCard
          label="A liberar"
          value={formatCurrency(primary?.pending ?? 0, currency)}
          hint="Recebido, aguardando o prazo de liberação"
          icon={ArrowDownLeft}
        />
        <BalanceCard
          label="Total"
          value={formatCurrency((primary?.available ?? 0) + (primary?.pending ?? 0), currency)}
          hint="Disponível mais o que está a liberar"
          icon={ArrowUpRight}
        />
      </div>

      <WithdrawForm
        availableCents={primary?.available ?? 0}
        currency={currency}
        canWithdraw={["owner", "admin"].includes(membershipRole)}
        environment={environment}
      />

      {balances.length > 1 && (
        <div className="card">
          <SectionTitle
            title="Outras moedas"
            description="Cada moeda tem saldo próprio; não há conversão automática."
          />
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            {balances.slice(1).map((b) => (
              <div key={b.currency} className="flex items-baseline justify-between gap-4 py-1.5">
                <dt className="text-sm text-flux-muted">{b.currency}</dt>
                <dd className="text-sm font-medium">{formatCurrency(b.available, b.currency)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="space-y-3">
        <SectionTitle
          title="Extrato"
          description="Toda entrada e saída de saldo, na ordem em que aconteceram."
        />

        {error ? (
          <ErrorState detail={error.message} />
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Nenhuma movimentação ainda"
            description="O extrato é alimentado automaticamente quando uma cobrança é paga, reembolsada ou quando há cobrança de taxa."
            action={
              <Link href="/dashboard/payments/new" className="btn-primary">
                <Plus className="w-4 h-4" />
                Nova cobrança
              </Link>
            }
          />
        ) : (
          <>
            <Table
              headers={["Data", "Movimentação", "Cobrança", "Valor", "Taxa", "Líquido", "Liberação"]}
              align={{ 3: "right", 4: "right", 5: "right" }}
            >
              {transactions.map((t) => {
                const released = !t.available_on || new Date(t.available_on) <= new Date();
                return (
                  <tr key={t.id} className="hover:bg-flux-gray/40">
                    <td className="px-5 py-4 text-flux-muted whitespace-nowrap">
                      {formatDate(t.created_at)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium">{TX_LABELS[t.type] || t.type}</div>
                      {t.description && (
                        <div className="text-xs text-flux-muted mt-0.5">{t.description}</div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {t.payment_id ? (
                        <Link
                          href={`/dashboard/payments/${t.payment_id}`}
                          className="hover:underline"
                        >
                          <Mono>{t.payment_id.slice(0, 8)}</Mono>
                        </Link>
                      ) : (
                        <span className="text-flux-muted">—</span>
                      )}
                    </td>
                    <td
                      className={`px-5 py-4 text-right font-medium whitespace-nowrap ${
                        t.amount < 0 ? "text-red-300" : ""
                      }`}
                    >
                      {formatCurrency(t.amount, t.currency)}
                    </td>
                    <td className="px-5 py-4 text-right text-flux-muted whitespace-nowrap">
                      {t.fee ? formatCurrency(-Math.abs(t.fee), t.currency) : "—"}
                    </td>
                    <td className="px-5 py-4 text-right font-medium whitespace-nowrap">
                      {formatCurrency(t.net, t.currency)}
                    </td>
                    <td className="px-5 py-4 text-flux-muted whitespace-nowrap">
                      {released ? "Liberado" : formatDate(t.available_on!)}
                    </td>
                  </tr>
                );
              })}
            </Table>

            <Pagination
              basePath="/dashboard/wallet"
              query={{}}
              page={page}
              hasMore={hasMore}
            />
          </>
        )}
      </div>
    </div>
  );
}
