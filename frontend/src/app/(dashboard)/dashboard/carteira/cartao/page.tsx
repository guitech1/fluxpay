"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CreditCard, Loader2, Eye, EyeOff } from "lucide-react";

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
  const [details, setDetails] = useState<{ number: string | null; cvv: string | null; expiry: string | null } | null>(null);
  const [showDetails, setShowDetails] = useState(false);

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
          <p className="text-sm text-flux-muted">Pré-pago via NexusPag</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-flux-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-700 via-red-900 to-black p-6 min-h-[180px] shadow-xl border border-red-500/20">
            <div className="absolute top-4 right-4 opacity-80">
              <CreditCard className="w-8 h-8 text-white/70" />
            </div>
            <p className="text-white/60 text-xs tracking-widest uppercase mb-6">FluxPay · Virtual</p>
            <p className="font-mono text-lg tracking-widest text-white">
              {showDetails && details?.number
                ? details.number.replace(/(\d{4})(?=\d)/g, "$1 ")
                : card?.last4
                  ? `•••• •••• •••• ${card.last4}`
                  : "•••• •••• •••• ••••"}
            </p>
            <div className="mt-6 flex justify-between items-end">
              <div>
                <p className="text-[10px] text-white/50 uppercase">Titular</p>
                <p className="text-sm text-white">{card?.printed_name || "—"}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-white/50 uppercase">Validade</p>
                <p className="text-sm text-white">{showDetails && details?.expiry ? details.expiry : "••/••"}</p>
              </div>
              {showDetails && details?.cvv && (
                <div className="text-right">
                  <p className="text-[10px] text-white/50 uppercase">CVV</p>
                  <p className="text-sm text-white">{details.cvv}</p>
                </div>
              )}
            </div>
          </div>

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
              <button
                type="button"
                disabled={busy}
                onClick={requestCard}
                className="btn-primary"
              >
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
            <button type="button" onClick={load} className="btn-secondary" disabled={busy}>
              Atualizar
            </button>
          </div>

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
