import Link from "next/link";
import { CreditCard, FileText, ArrowLeftRight, Settings2, UserPlus, ChevronRight } from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard-server";
import { formatCurrency } from "@/lib/utils";
import { BalanceHero } from "@/components/carteira/BalanceHero";
import { MoveRow, type WalletMove } from "@/components/carteira/MoveRow";
import { PixMark } from "@/components/carteira/PixMark";

export const dynamic = "force-dynamic";

function walletStatusLabel(status: string | null | undefined): {
  title: string;
  description: string;
  tone: "neutral" | "pending" | "ok" | "bad";
} {
  if (!status) {
    return {
      title: "Carteira nao solicitada",
      description: "Abra sua conta digital para usar Pix e cartao virtual. O cadastro e obrigatorio para todos.",
      tone: "neutral",
    };
  }
  if (status === "pending_review") {
    return {
      title: "Sua carteira esta aguardando aprovacao",
      description:
        "Voce pode acompanhar o status aqui. As operacoes financeiras ficam disponiveis somente apos a aprovacao administrativa.",
      tone: "pending",
    };
  }
  if (status === "rejected") {
    return {
      title: "Sua carteira foi reprovada",
      description: "Entre em contato com o suporte para mais informacoes. Operacoes financeiras permanecem bloqueadas.",
      tone: "bad",
    };
  }
  if (status === "blocked") {
    return {
      title: "Sua carteira esta bloqueada",
      description: "Operacoes financeiras estao temporariamente indisponiveis.",
      tone: "bad",
    };
  }
  if (status === "approved") {
    return {
      title: "Sua carteira foi aprovada",
      description: "Voce ja pode usar Pix, cartao virtual e demais operacoes.",
      tone: "ok",
    };
  }
  return {
    title: "Carteira Digital",
    description: "Acompanhe o status da sua conta.",
    tone: "neutral",
  };
}

const NOTE_CLASS = {
  ok: "fxb-note fxb-note--ok",
  pending: "fxb-note fxb-note--warn",
  bad: "fxb-note fxb-note--err",
  neutral: "fxb-note",
} as const;

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

  let walletStatus: string | null = null;
  try {
    const { data: row } = await supabase
      .from("fluxpay_cards")
      .select("status")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    walletStatus = row?.status ?? null;
  } catch {
    walletStatus = null;
  }

  const statusInfo = walletStatusLabel(walletStatus);
  const hasNoWallet = !walletStatus;
  const isApproved = walletStatus === "approved";
  const canOperate = isApproved;

  const more = [
    ...(hasNoWallet || walletStatus === "rejected"
      ? [
          {
            href: "/dashboard/carteira/cadastro",
            label: hasNoWallet ? "Solicitar carteira" : "Solicitar novamente",
            description: "Cadastro digital obrigatorio",
            icon: UserPlus,
          },
        ]
      : []),
    { href: "/dashboard/carteira/config", label: "Configurações", description: "Aparência e PIN Pix", icon: Settings2 },
  ];

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

      <div className={NOTE_CLASS[statusInfo.tone]}>
        <p style={{ fontWeight: 600 }}>{statusInfo.title}</p>
        <p style={{ marginTop: 4, opacity: 0.9 }}>{statusInfo.description}</p>
        {(hasNoWallet || walletStatus === "rejected") && (
          <Link
            href="/dashboard/carteira/cadastro"
            className="fxb-link-pill"
            style={{ display: "inline-flex", marginTop: 12 }}
          >
            {hasNoWallet ? "Solicitar carteira digital" : "Solicitar novamente"}
          </Link>
        )}
      </div>

      <div className="fxb-cols">
        <div className="fxb-col">
          <BalanceHero
            available={formatCurrency(available, currency)}
            pending={formatCurrency(pending, currency)}
            total={formatCurrency(available + pending, currency)}
          >
            {canOperate ? (
              <>
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
              </>
            ) : (
              <>
                <span className="fxb-act" aria-disabled="true" style={{ opacity: 0.45, pointerEvents: "none" }}>
                  <span className="fxb-act-btn"><PixMark size={26} /></span>
                  <span className="fxb-act-label">Pix</span>
                </span>
                <span className="fxb-act" aria-disabled="true" style={{ opacity: 0.45, pointerEvents: "none" }}>
                  <span className="fxb-act-btn"><CreditCard size={24} /></span>
                  <span className="fxb-act-label">Cartão</span>
                </span>
                <Link href="/dashboard/carteira/extrato" className="fxb-act">
                  <span className="fxb-act-btn"><ArrowLeftRight size={24} /></span>
                  <span className="fxb-act-label">Extrato</span>
                </Link>
                <span className="fxb-act" aria-disabled="true" style={{ opacity: 0.45, pointerEvents: "none" }}>
                  <span className="fxb-act-btn"><FileText size={24} /></span>
                  <span className="fxb-act-label">Comprovantes</span>
                </span>
              </>
            )}
          </BalanceHero>

          <section>
            <div className="fxb-section-head">
              <h2>Mais opções</h2>
            </div>
            <div className="fxb-list">
              {more.map((item, i) => {
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
            {canOperate ? (
              <Link href="/dashboard/carteira/extrato" className="fxb-link-pill">Ver extrato</Link>
            ) : null}
          </div>

          {moves.length === 0 ? (
            <div className="fxb-empty">
              <span className="fxb-round fxb-round--lg"><ArrowLeftRight size={22} /></span>
              <h3>Nenhuma movimentação ainda</h3>
              <p>
                {canOperate
                  ? "Quando você receber ou enviar dinheiro, ele aparece aqui."
                  : "As operações financeiras liberam após a aprovação da carteira."}
              </p>
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
