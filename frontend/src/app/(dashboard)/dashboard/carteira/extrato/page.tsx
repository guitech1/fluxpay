import Link from "next/link";
import { ArrowLeftRight, Plus } from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard-server";
import { WithdrawForm } from "@/components/dashboard/WithdrawForm";
import { formatCurrency } from "@/lib/utils";
import { ScreenHeader } from "@/components/carteira/ScreenHeader";
import { MoveRow, type WalletMove } from "@/components/carteira/MoveRow";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function CarteiraExtratoPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { supabase, organization, environment, role } = await requireDashboardContext();
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

  const all = (txData || []) as WalletMove[];
  const hasMore = all.length > PAGE_SIZE;
  const moves = all.slice(0, PAGE_SIZE);

  const balances = (balance || []) as { currency: string; available: number; pending: number }[];
  const primary = balances[0];
  const currency = primary?.currency || organization.default_currency || "BRL";
  const available = primary?.available ?? 0;
  const pending = primary?.pending ?? 0;

  return (
    <div className="fxb-narrow" style={{ maxWidth: 760 }}>
      <ScreenHeader
        title="Extrato"
        description="Toda entrada e saída, na ordem em que aconteceram"
        icon={<span className="fxb-round fxb-round--lg"><ArrowLeftRight size={22} /></span>}
      />

      <div className="fxb-stats">
        <div className="fxb-stat fxb-rise">
          <span>Disponível</span>
          <strong>{formatCurrency(available, currency)}</strong>
        </div>
        <div className="fxb-stat fxb-rise" style={{ "--i": 1 } as React.CSSProperties}>
          <span>A liberar</span>
          <strong>{formatCurrency(pending, currency)}</strong>
        </div>
        <div className="fxb-stat fxb-rise" style={{ "--i": 2 } as React.CSSProperties}>
          <span>Total</span>
          <strong>{formatCurrency(available + pending, currency)}</strong>
        </div>
      </div>

      <section className="space-y-3" style={{ marginBottom: "1.5rem" }}>
        <div className="fxb-section-head">
          <div>
            <h2>Sacar saldo</h2>
            <p>Envie seu saldo disponível para uma chave Pix</p>
          </div>
        </div>
        <WithdrawForm
          availableCents={available}
          currency={currency}
          canWithdraw={["owner", "admin"].includes(role)}
          environment={environment}
        />
      </section>

      {balances.length > 1 && (
        <section className="fxb-panel" style={{ marginBottom: "1.5rem" }}>
          <div className="fxb-section-head">
            <div>
              <h2>Outras moedas</h2>
              <p>Cada moeda tem saldo próprio, sem conversão automática.</p>
            </div>
          </div>
          <dl className="fxb-sum">
            {balances.slice(1).map((b) => (
              <div key={b.currency}>
                <dt>{b.currency}</dt>
                <dd>{formatCurrency(b.available, b.currency)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section>
        <div className="fxb-section-head">
          <h2>Movimentações</h2>
        </div>

        {error ? (
          <div className="fxb-note fxb-note--err" role="alert">
            Não foi possível carregar o extrato agora. Tente novamente em instantes.
          </div>
        ) : moves.length === 0 ? (
          <div className="fxb-panel fxb-empty">
            <span className="fxb-round fxb-round--lg"><ArrowLeftRight size={22} /></span>
            <h3>Nenhuma movimentação ainda</h3>
            <p>Quando uma cobrança for paga, reembolsada ou tiver taxa, ela aparece aqui.</p>
            <Link href="/dashboard/payments/new" className="btn btn-primary">
              <Plus size={16} />
              Nova cobrança
            </Link>
          </div>
        ) : (
          <>
            <div className="fxb-list">
              {moves.map((m, i) => (
                <MoveRow key={m.id} move={m} detailed index={Math.min(i, 8)} />
              ))}
            </div>

            {(page > 1 || hasMore) && (
              <nav className="fxb-pager" aria-label="Paginação">
                {page > 1 ? (
                  <Link className="fxb-link-pill" href={`/dashboard/carteira/extrato?page=${page - 1}`}>
                    Anteriores
                  </Link>
                ) : (
                  <span />
                )}
                <span>Página {page}</span>
                {hasMore ? (
                  <Link className="fxb-link-pill" href={`/dashboard/carteira/extrato?page=${page + 1}`}>
                    Próximas
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  );
}
