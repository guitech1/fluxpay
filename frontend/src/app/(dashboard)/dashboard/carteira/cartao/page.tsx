"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Eye, EyeOff, RefreshCw } from "lucide-react";
import { VirtualCard } from "@/components/fluxpay-card/VirtualCard";

interface CardView {
  status: string | null;
  last4: string | null;
  printed_name: string | null;
  balance_cents: number | null;
  can_create: boolean;
  min_balance_to_create_cents: number | null;
}

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
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
      setCard(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar cartão");
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
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
      setCard(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao pedir cartão");
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
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
      setDetails(json.data);
      setShowDetails(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao revelar dados");
    } finally {
      setBusy(false);
    }
  }

  async function recharge() {
    const cents = Math.round(parseFloat(rechargeCents.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < 100) {
      setError("Informe um valor mínimo de R$ 1,00 para recarga.");
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
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
      setRechargeCents("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na recarga");
    } finally {
      setBusy(false);
    }
  }

  const displayNumber =
    showDetails && details?.number
      ? details.number.replace(/\D/g, "")
      : card?.last4
        ? `000000000000${card.last4}`.slice(-16)
        : null;

  const virtualStatus =
    card?.status === "blocked" || card?.status === "inactive"
      ? "blocked"
      : card?.status
        ? "approved"
        : "pending_review";

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/carteira"
          className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Cartão virtual</h1>
          <p className="text-sm text-flux-muted">
            Cartão real NexusPag · visual FluxPay Card
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-flux-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          <VirtualCard
            fullName={card?.printed_name || "—"}
            cardNumber={displayNumber}
            status={virtualStatus as "approved" | "blocked" | "pending_review" | "rejected"}
          />

          {showDetails && details && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm space-y-1">
              <p>
                <span className="text-flux-muted">Validade:</span>{" "}
                {details.expiry || "—"}
              </p>
              <p>
                <span className="text-flux-muted">CVV:</span> {details.cvv || "—"}
              </p>
              <p className="text-xs text-flux-muted pt-1">
                Dados sensíveis: não compartilhe e oculte após o uso.
              </p>
            </div>
          )}

          {card?.balance_cents != null && (
            <p className="text-sm text-flux-muted">
              Saldo no cartão:{" "}
              {(card.balance_cents / 100).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!card?.status && card?.can_create && (
              <button type="button" disabled={busy} onClick={requestCard} className="btn-primary">
                {busy ? "Solicitando…" : "Pedir cartão virtual"}
              </button>
            )}
            {card?.status && (
              <button
                type="button"
                disabled={busy}
                onClick={() => (showDetails ? setShowDetails(false) : revealDetails())}
                className="btn-secondary inline-flex items-center gap-2"
              >
                {showDetails ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {showDetails ? "Ocultar dados" : "Ver número e CVV"}
              </button>
            )}
            <button
              type="button"
              onClick={load}
              className="btn-secondary inline-flex items-center gap-2"
              disabled={busy}
            >
              <RefreshCw className="w-4 h-4" /> Atualizar
            </button>
          </div>

          {card?.status && (
            <div className="rounded-xl border border-white/10 p-4 space-y-3">
              <p className="text-sm font-medium">Recarregar cartão</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Valor R$"
                  className="flex-1 rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2"
                  value={rechargeCents}
                  onChange={(e) => setRechargeCents(e.target.value)}
                />
                <button type="button" className="btn-primary" disabled={busy} onClick={recharge}>
                  Recarregar
                </button>
              </div>
            </div>
          )}

          {!card?.can_create && !card?.status && (
            <p className="text-sm text-flux-muted">
              A conta Nexus precisa do saldo mínimo para solicitar o cartão
              {card?.min_balance_to_create_cents != null
                ? ` (R$ ${(card.min_balance_to_create_cents / 100).toFixed(2)})`
                : ""}
              .
            </p>
          )}
        </>
      )}
    </div>
  );
}
