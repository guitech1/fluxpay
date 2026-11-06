import Link from "next/link";
import { CreditCard, FileText, ArrowLeftRight, Settings2, UserPlus, Wallet, ChevronRight } from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard-server";
import { formatCurrency } from "@/lib/utils";
import { BalanceHero } from "@/components/carteira/BalanceHero";
import { MoveRow, type WalletMove } from "@/components/carteira/MoveRow";
import { PixMark } from "@/components/carteira/PixMark";

export const dynamic = "force-dynamic";

const MORE = [
  { href: "/dashboard/carteira/cadastro", label: "Abrir conta", description: "Cadastro digital em 2 etapas", icon: UserPlus },
  { href: "/dashboard/fluxpay-card", label: "FluxPay Card", description: "Carteira interna", icon: Wallet },
  { href: "/dashboard/carteira/config", label: "Configurações", description: "Aparência e PIN Pix", icon: Settings2 },
];

export default async function CarteiraDigitalPage() {
  const { supabase, organization, environment } = await requireDashboardContext();

  const [{ data: balance }, { data: txData }] = await Promise.all([
    supabase.rpc("get_organization_balance", {
      p_organization_id: organization.id,
      p_environment: environment,
    }),
    supabase
      .from("balance_transactions")
      .select("id, type, amount, net, fee, currency, description, payment_id, available_on, created_at")
      .eq("environment", environment)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const balances = (balance || []) as { currency: string; available: number; pending: number }[];
  const primary = balances[0];
  const currency = primary?.currency || organization.default_currency || "BRL";
  const available = primary?.available ?? 0;
  const pending = primary?.pending ?? 0;
  const moves = (txData || []) as WalletMove[];

  return (
    <div className="space-y-6">
      <header className="fxb-head fxb-rise">
        <span className="fxb-round fxb-round--lg" aria-hidden>
          {(organization.name || "F").trim().charAt(0).toUpperCase()}
        </span>
        <div className="fxb-head-text">
          <h1>Carteira Digital</h1>
          <p>
            {organization.name}
            {environment !== "live" ? " · modo de teste" : ""}
          </p>
        </div>
      </header>

      <div className="fxb-cols">
        <div className="fxb-col">
          <BalanceHero
            available={formatCurrency(available, currency)}
            pending={formatCurrency(pending, currency)}
            total={formatCurrency(available + pending, currency)}
          >
            <Link href="/dashboard/carteira/pix" className="fxb-act">
              <span className="fxb-act-btn"><PixMark size={26} /></span>
              <span className="fxb-act-label">Pix</span>
            </Link>
            <Link href="/dashboard/carteira/cartao" className="fxb-act">
              <span className="fxb-act-btn"><CreditCard size={24} /></span>
              <span className="fxb-act-label">Cartão</span>
            </Link>
            <Link href="/dashboard/carteira/extrato" className="fxb-act">
              <span className="fxb-act-btn"><ArrowLeftRight size={24} /></span>
              <span className="fxb-act-label">Extrato</span>
            </Link>
            <Link href="/dashboard/carteira/comprovantes" className="fxb-act">
              <span className="fxb-act-btn"><FileText size={24} /></span>
              <span className="fxb-act-label">Comprovantes</span>
            </Link>
          </BalanceHero>

          <section>
            <div className="fxb-section-head">
              <h2>Mais opções</h2>
            </div>
            <div className="fxb-list">
              {MORE.map((item, i) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="fxb-row fxb-row--link fxb-rise"
                    style={{ "--i": i + 2 } as React.CSSProperties}
                  >
                    <span className="fxb-round"><Icon size={20} /></span>
                    <div className="fxb-row-main">
                      <p className="fxb-row-title">{item.label}</p>
                      <p className="fxb-row-sub">{item.description}</p>
                    </div>
                    <ChevronRight size={18} />
                  </Link>
                );
              })}
            </div>
          </section>
        </div>

        <section className="fxb-panel fxb-rise" style={{ "--i": 1 } as React.CSSProperties}>
          <div className="fxb-section-head">
            <div>
              <h2>Últimas movimentações</h2>
              <p>Entradas e saídas mais recentes</p>
            </div>
            <Link href="/dashboard/carteira/extrato" className="fxb-link-pill">Ver extrato</Link>
          </div>

          {moves.length === 0 ? (
            <div className="fxb-empty">
              <span className="fxb-round fxb-round--lg"><ArrowLeftRight size={22} /></span>
              <h3>Nenhuma movimentação ainda</h3>
              <p>Quando você receber ou enviar dinheiro, ele aparece aqui.</p>
            </div>
          ) : (
            <div className="fxb-list">
              {moves.map((m, i) => (
                <MoveRow key={m.id} move={m} index={i + 2} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
