"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, Eye, EyeOff, RefreshCw, Plus } from "lucide-react";
import { WalletCard } from "@/components/carteira/WalletCard";
import { ScreenHeader } from "@/components/carteira/ScreenHeader";

interface CardView {
  issued?: boolean;
  status: string | null;
  last4: string | null;
  printed_name: string | null;
  balance_cents: number | null;
  can_create: boolean;
  can_request?: boolean;
  min_balance_to_create_cents: number | null;
}

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CarteiraCartaoPage() {
  const [card, setCard] = useState<CardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<{
    number: string | null;
    cvv: string | null;
    expiry: string | null;
  } | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [rechargeCents, setRechargeCents] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/dashboard-api/nexus-card", { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message || "Nao foi possivel carregar o cartao.");
      setCard(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nao foi possivel carregar o cartao.");
      setCard(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function requestCard() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/dashboard-api/nexus-card/request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message || "Nao foi possivel solicitar o cartao.");
      setCard(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nao foi possivel solicitar o cartao.");
    } finally {
      setBusy(false);
    }
  }

  async function revealDetails() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/dashboard-api/nexus-card/details", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message || "Nao foi possivel revelar os dados.");
      setDetails(json.data);
      setShowDetails(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nao foi possivel revelar os dados.");
    } finally {
      setBusy(false);
    }
  }

  async function recharge() {
    const cents = Math.round(parseFloat(rechargeCents.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < 100) {
      setError("Informe um valor minimo de R$ 1,00 para recarga.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/dashboard-api/nexus-card/recharges", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_cents: cents,
          idempotency_key: `nrc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message || "Nao foi possivel recarregar o cartao.");
      setRechargeCents("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nao foi possivel recarregar o cartao.");
    } finally {
      setBusy(false);
    }
  }

  const isIssued = Boolean(card?.issued || card?.status || card?.last4);
  const canRequest = Boolean(card?.can_request ?? card?.can_create) && !isIssued;

  const displayNumber =
    showDetails && details?.number
      ? details.number.replace(/\D/g, "")
      : card?.last4
        ? `000000000000${card.last4}`.slice(-16)
        : null;

  const virtualStatus =
    card?.status === "blocked" || card?.status === "inactive"
      ? "blocked"
      : isIssued
        ? "approved"
        : "pending_review";

  return (
    <div className="fxb-narrow" style={{ maxWidth: 960 }}>
      <ScreenHeader
        title="Cartão virtual"
        description="Para suas compras online, com saldo que você recarrega"
        icon={<span className="fxb-round fxb-round--lg"><CreditCard size={22} /></span>}
      />

      {loading ? (
        <div className="fxb-cols" aria-busy="true" aria-label="Carregando">
          <div className="fxb-skel" style={{ height: 240 }} />
          <div className="fxb-skel" style={{ height: 240 }} />
        </div>
      ) : (
        <div className="fxb-cols">
          <div className="fxb-col">
            {isIssued ? (
              <WalletCard
                fullName={card?.printed_name || "—"}
                cardNumber={displayNumber}
                masked={!showDetails}
                expiry={showDetails ? details?.expiry : null}
                status={virtualStatus as "approved" | "blocked" | "pending_review" | "rejected"}
              />
            ) : (
              <section className="fxb-panel">
                <div className="fxb-section-head">
                  <div>
                    <h2>Cartao virtual FluxPay</h2>
                    <p>
                      Solicite seu cartao pre-pago para usar o saldo da carteira em compras online.
                      E necessario ter pelo menos R$ 100,00 de saldo disponivel.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {isIssued && card?.balance_cents != null && (
              <div className="fxb-stat">
                <span>Saldo no cartão</span>
                <strong>{brl(card.balance_cents)}</strong>
              </div>
            )}

            {showDetails && details && (
              <div className="fxb-details">
                <div>
                  <span>Validade</span>
                  <strong>{details.expiry || "—"}</strong>
                </div>
                <div>
                  <span>CVV</span>
                  <strong>{details.cvv || "—"}</strong>
                </div>
                <p className="fxb-row-sub" style={{ gridColumn: "1 / -1" }}>
                  Não compartilhe esses dados e oculte-os depois de usar.
                </p>
              </div>
            )}
          </div>

          <div className="fxb-col">
            {error && (
              <div className="fxb-note fxb-note--err" role="alert">
                {error}
              </div>
            )}

            <div className="fxb-quick">
              {canRequest && (
                <button type="button" disabled={busy} onClick={requestCard} className="fxb-quick-btn">
                  <span className="fxb-round"><Plus size={20} /></span>
                  {busy ? "Solicitando…" : "Pedir cartão"}
                </button>
              )}
              {isIssued && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => (showDetails ? setShowDetails(false) : revealDetails())}
                  className="fxb-quick-btn"
                >
                  <span className="fxb-round">
                    {showDetails ? <EyeOff size={20} /> : <Eye size={20} />}
                  </span>
                  {showDetails ? "Ocultar dados" : "Ver número e CVV"}
                </button>
              )}
              <button type="button" onClick={load} className="fxb-quick-btn" disabled={busy}>
                <span className="fxb-round"><RefreshCw size={20} /></span>
                Atualizar
              </button>
            </div>

            {isIssued && (
              <section className="fxb-panel">
                <div className="fxb-section-head">
                  <div>
                    <h2>Recarregar cartão</h2>
                    <p>Adicione saldo para usar nas compras</p>
                  </div>
                </div>
                <div className="fxb-recharge">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Valor em R$"
                    value={rechargeCents}
                    onChange={(e) => setRechargeCents(e.target.value)}
                    aria-label="Valor da recarga"
                  />
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={recharge}>
                    Recarregar
                  </button>
                </div>
              </section>
            )}

            {!isIssued && !canRequest && !error && (
              <div className="fxb-note fxb-note--warn">
                Sua solicitacao esta sendo processada ou a carteira ainda nao esta pronta para emissao.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
