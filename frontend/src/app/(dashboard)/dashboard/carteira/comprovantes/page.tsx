import { FileText } from "lucide-react";
import { requireDashboardContext } from "@/lib/dashboard-server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ScreenHeader } from "@/components/carteira/ScreenHeader";
import { PixBadge } from "@/components/carteira/PixMark";

export const dynamic = "force-dynamic";

interface Receipt {
  id: string;
  net: number;
  fee: number | null;
  amount: number;
  currency: string | null;
  status: string;
  pix_key_type: string | null;
  created_at: string;
  provider_reference: string | null;
}

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "err" }> = {
  completed: { label: "Concluído", tone: "ok" },
  processing: { label: "Processando", tone: "warn" },
  pending: { label: "Em análise", tone: "warn" },
  failed: { label: "Não concluído", tone: "err" },
  rejected: { label: "Recusado", tone: "err" },
};

const KEY_LABEL: Record<string, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  phone: "Telefone",
  random: "Chave aleatória",
};

export default async function ComprovantesPage() {
  const { supabase, organization, environment } = await requireDashboardContext();

  const { data: wallet, error: walletError } = await supabase
    .from("fluxpay_cards")
    .select("status")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (walletError || wallet?.status !== "approved") {
    return (
      <div className="fxb-narrow">
        <ScreenHeader
          title="Comprovantes"
          description="Disponíveis após a aprovação da Carteira Digital"
          icon={<span className="fxb-round fxb-round--lg"><FileText size={22} /></span>}
        />
        <div className="fxb-note fxb-note--warn">
          <p style={{ fontWeight: 600 }}>Carteira Digital ainda não aprovada</p>
          <p style={{ marginTop: 4 }}>O histórico financeiro e os comprovantes serão liberados após a aprovação da sua solicitação.</p>
        </div>
      </div>
    );
  }

  const { data: withdrawals } = await supabase
    .from("withdrawal_requests")
    .select("id, net, fee, amount, currency, status, pix_key_type, created_at, provider_reference")
    .eq("organization_id", organization.id)
    .eq("environment", environment)
    .in("status", ["completed", "processing", "failed", "rejected", "pending"])
    .order("created_at", { ascending: false })
    .limit(30);

  const rows = (withdrawals || []) as Receipt[];

  return (
    <div className="fxb-narrow">
      <ScreenHeader
        title="Comprovantes"
        description="Seus saques e transferências Pix"
        icon={<span className="fxb-round fxb-round--lg"><FileText size={22} /></span>}
      />

      {rows.length === 0 ? (
        <div className="fxb-panel fxb-empty fxb-rise">
          <span className="fxb-round fxb-round--lg"><FileText size={22} /></span>
          <h3>Nenhum comprovante ainda</h3>
          <p>Quando você enviar um Pix ou fizer um saque, o comprovante aparece aqui.</p>
        </div>
      ) : (
        <div className="fxb-list">
          {rows.map((w, i) => {
            const st = STATUS[w.status] || { label: w.status, tone: "warn" as const };
            const cur = w.currency || "BRL";
            return (
              <div
                key={w.id}
                className="fxb-row fxb-rise"
                style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
              >
                <PixBadge />
                <div className="fxb-row-main">
                  <p className="fxb-row-title">
                    Pix enviado <span className={`fxb-status fxb-status--${st.tone}`}>{st.label}</span>
                  </p>
                  <p className="fxb-row-sub">
                    {formatDate(w.created_at)}
                    {w.pix_key_type ? ` · ${KEY_LABEL[w.pix_key_type] || w.pix_key_type}` : ""}
                  </p>
                  <p className="fxb-row-meta">
                    Taxa {formatCurrency(w.fee || 0, cur)} ·{" "}
                    <span className="fxb-mono">{(w.provider_reference || w.id).slice(0, 12)}</span>
                  </p>
                </div>
                <div className="fxb-row-end">
                  <p className="fxb-money fxb-money--neg">- {formatCurrency(w.net, cur)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
