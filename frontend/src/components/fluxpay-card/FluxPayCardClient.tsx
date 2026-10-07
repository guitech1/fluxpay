"use client";

import { useCallback, useEffect, useState } from "react";
import { VirtualCard } from "./VirtualCard";
import { cn } from "@/lib/utils";
import { dashboardFetch } from "@/lib/dashboard-api";

type CardStatus =
  | "not_created"
  | "pending_review"
  | "approved"
  | "rejected"
  | "blocked";

interface CardData {
  id: string;
  full_name: string;
  phone: string;
  status: CardStatus;
  card_number: string | null;
  card_number_display: string | null;
  rejection_reason: string | null;
  blocked_at: string | null;
  created_at: string;
}

interface ApiState {
  status: CardStatus;
  card: CardData | null;
  balance: { available: number; currency: string };
}

type View =
  | "loading"
  | "main"
  | "create"
  | "transfer"
  | "confirm-transfer"
  | "receipt"
  | "error";

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function genIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `fp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function FluxPayCardClient() {
  const [state, setState] = useState<ApiState | null>(null);
  const [view, setView] = useState<View>("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [destNumber, setDestNumber] = useState("");
  const [destInfo, setDestInfo] = useState<{
    full_name: string;
    card_number_masked: string;
  } | null>(null);
  const [amountStr, setAmountStr] = useState("");
  const [transferPassword, setTransferPassword] = useState("");
  const [receipt, setReceipt] = useState<{
    public_id: string;
    amount: number;
    destination_name: string;
    destination_card_masked: string;
    created_at: string;
  } | null>(null);

  const [copied, setCopied] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  const load = useCallback(async (opts?: { preserveView?: boolean }) => {
    try {
      setError(null);
      const data = await dashboardFetch<ApiState>("/fluxpay-card");
      setState(data);
      if (!opts?.preserveView) {
        setView("main");
      }
    } catch (e) {
      setError((e as Error).message);
      if (!opts?.preserveView) {
        setView("error");
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function amountToCents(str: string): number {
    const cleaned = str.replace(/[^\d,]/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await dashboardFetch<{ status: CardStatus; card: CardData }>(
        "/fluxpay-card/create",
        {
          method: "POST",
          body: {
            full_name: fullName,
            phone,
            password,
            password_confirmation: passwordConfirm,
          },
        }
      );
      setState((s) => ({
        status: data.status,
        card: data.card,
        balance: s?.balance ?? { available: 0, currency: "BRL" },
      }));
      setPassword("");
      setPasswordConfirm("");
      setView("main");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function searchRecipient() {
    setBusy(true);
    setError(null);
    setDestInfo(null);
    try {
      const digits = destNumber.replace(/\D/g, "");
      const data = await dashboardFetch<{
        full_name: string;
        card_number_masked: string;
      }>(`/fluxpay-card/recipient/${digits}`);
      setDestInfo({
        full_name: data.full_name,
        card_number_masked: data.card_number_masked,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleTransfer() {
    setBusy(true);
    setError(null);
    try {
      const amountCents = amountToCents(amountStr);
      const data = await dashboardFetch<{
        transaction: {
          public_id: string;
          amount: number;
          destination_name: string;
          destination_card_masked: string;
          created_at: string;
        };
      }>("/fluxpay-card/transfer", {
        method: "POST",
        body: {
          card_number: destNumber.replace(/\D/g, ""),
          amount_cents: amountCents,
          password: transferPassword,
          idempotency_key: genIdempotencyKey(),
        },
      });
      setReceipt(data.transaction);
      setTransferPassword("");
      setView("receipt");
      await load({ preserveView: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleBlock() {
    setBusy(true);
    setError(null);
    try {
      const data = await dashboardFetch<{ status: CardStatus; card: CardData }>(
        "/fluxpay-card/block",
        { method: "POST", body: {} }
      );
      setState((s) => ({
        status: data.status,
        card: data.card,
        balance: s?.balance ?? { available: 0, currency: "BRL" },
      }));
      setConfirmBlock(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnblock() {
    setBusy(true);
    setError(null);
    try {
      const data = await dashboardFetch<{ status: CardStatus; card: CardData }>(
        "/fluxpay-card/unblock",
        { method: "POST", body: {} }
      );
      setState((s) => ({
        status: data.status,
        card: data.card,
        balance: s?.balance ?? { available: 0, currency: "BRL" },
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function copyNumber() {
    const num = state?.card?.card_number;
    if (!num) return;
    void navigator.clipboard.writeText(num).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyTxId() {
    if (!receipt?.public_id) return;
    void navigator.clipboard.writeText(receipt.public_id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (view === "loading") {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-sm text-flux-muted">Carregando carteira...</div>
      </div>
    );
  }

  if (view === "error" && !state) {
    return (
      <div className="card max-w-md mx-auto text-center space-y-4">
        <p className="text-sm text-red-400">{error || "Erro ao carregar."}</p>
        <button type="button" className="btn-primary" onClick={() => void load()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  const status = state?.status ?? "not_created";
  const card = state?.card;

  if (status === "not_created" || view === "create") {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">FluxPay Card</h1>
          <p className="text-sm text-flux-muted">
            Crie sua carteira interna para receber e enviar transferencias entre
            usuarios FluxPay.
          </p>
        </div>
        <form onSubmit={handleCreate} className="card space-y-4">
          <div>
            <label className="block text-xs text-flux-muted mb-1.5">Nome completo</label>
            <input
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nome e sobrenome"
              required
              autoComplete="name"
            />
          </div>
          <div>
            <label className="block text-xs text-flux-muted mb-1.5">Telefone</label>
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="DDD + numero"
              required
              autoComplete="tel"
            />
          </div>
          <div>
            <label className="block text-xs text-flux-muted mb-1.5">Senha da carteira</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimo 8 caracteres, letras e numeros"
              required
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-xs text-flux-muted mb-1.5">Confirmar senha</label>
            <input
              className="input"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "Enviando..." : "Criar minha carteira"}
          </button>
        </form>
      </div>
    );
  }

  if (status === "pending_review") {
    return (
      <div className="max-w-lg mx-auto space-y-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">FluxPay Card</h1>
        <div className="card space-y-3 py-10">
          <div className="text-lg font-medium">Carteira em analise</div>
          <p className="text-sm text-flux-muted max-w-sm mx-auto">
            Recebemos sua solicitacao. Nossa equipe esta analisando sua carteira
            FluxPay.
          </p>
          {card?.full_name && (
            <p className="text-xs text-flux-muted pt-2">Solicitante: {card.full_name}</p>
          )}
        </div>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="max-w-lg mx-auto space-y-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">FluxPay Card</h1>
        <div className="card space-y-3 py-8">
          <div className="text-lg font-medium text-red-300">Carteira rejeitada</div>
          {card?.rejection_reason && (
            <p className="text-sm text-flux-muted">Motivo: {card.rejection_reason}</p>
          )}
          <p className="text-sm text-flux-muted">Voce pode enviar uma nova solicitacao.</p>
          <button
            type="button"
            className="btn-primary mt-4"
            onClick={() => {
              setState((s) =>
                s ? { ...s, status: "not_created", card: null } : s
              );
              setView("create");
            }}
          >
            Nova solicitacao
          </button>
        </div>
      </div>
    );
  }

  if (view === "receipt" && receipt) {
    return (
      <div className="max-w-md mx-auto space-y-6">
        <div className="card space-y-5 text-center py-8">
          <div className="text-[11px] uppercase tracking-[0.2em] text-flux-muted">
            FluxPay
          </div>
          <div className="text-lg font-medium">Transferencia realizada</div>
          <div className="text-3xl font-semibold tracking-tight">
            {formatBRL(receipt.amount)}
          </div>
          <div className="border-t border-flux-border pt-4 space-y-3 text-left text-sm">
            <Row label="Para" value={receipt.destination_name} />
            <Row label="Carteira" value={receipt.destination_card_masked} />
            <Row
              label="Data"
              value={new Date(receipt.created_at).toLocaleString("pt-BR")}
            />
            <Row label="ID da transacao" value={receipt.public_id} mono />
            <Row label="Status" value="Concluida" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={copyTxId}>
              {copied ? "Copiado" : "Copiar ID"}
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={() => {
                // Mantem receipt em memoria para "Reabrir ultimo recibo".
                // Nao limpar aqui — so muda a view.
                setDestNumber("");
                setDestInfo(null);
                setAmountStr("");
                setView("main");
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "transfer" || view === "confirm-transfer") {
    const amountCents = amountToCents(amountStr);
    return (
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Fazer transferencia</h1>
          <button
            type="button"
            className="text-sm text-flux-muted hover:text-white"
            onClick={() => {
              setView("main");
              setError(null);
              setDestInfo(null);
              setTransferPassword("");
            }}
          >
            Voltar
          </button>
        </div>

        {view === "transfer" && (
          <div className="card space-y-4">
            <div>
              <label className="block text-xs text-flux-muted mb-1.5">
                Numero do cartao
              </label>
              <div className="flex gap-2">
                <input
                  className="input flex-1 font-mono"
                  value={destNumber}
                  onChange={(e) => {
                    setDestNumber(e.target.value);
                    setDestInfo(null);
                  }}
                  placeholder="0000 0000 0000 0000"
                  inputMode="numeric"
                />
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={searchRecipient}
                  disabled={busy}
                >
                  Buscar
                </button>
              </div>
            </div>
            {destInfo && (
              <div className="rounded-lg border border-flux-border bg-flux-gray/50 px-4 py-3">
                <div className="text-[10px] uppercase tracking-wider text-flux-muted mb-1">
                  Destinatario
                </div>
                <div className="font-medium">{destInfo.full_name}</div>
                <div className="text-xs text-flux-muted mt-0.5">
                  FluxPay Card {destInfo.card_number_masked}
                </div>
              </div>
            )}
            {destInfo && (
              <div>
                <label className="block text-xs text-flux-muted mb-1.5">Valor</label>
                <input
                  className="input text-lg"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                />
                <p className="text-xs text-flux-muted mt-1">
                  Disponivel: {formatBRL(state?.balance.available ?? 0)}
                </p>
              </div>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
            {destInfo && amountCents > 0 && (
              <button
                type="button"
                className="btn-primary w-full"
                onClick={() => {
                  setError(null);
                  setView("confirm-transfer");
                }}
              >
                Continuar
              </button>
            )}
          </div>
        )}

        {view === "confirm-transfer" && destInfo && (
          <div className="card space-y-4">
            <div className="space-y-3 text-sm">
              <Row label="Destinatario" value={destInfo.full_name} />
              <Row label="Valor" value={formatBRL(amountCents)} />
              <Row label="Origem" value="Minha Carteira FluxPay" />
            </div>
            <div>
              <label className="block text-xs text-flux-muted mb-1.5">
                Senha da carteira
              </label>
              <input
                className="input"
                type="password"
                value={transferPassword}
                onChange={(e) => setTransferPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="button"
              className="btn-primary w-full"
              disabled={busy || !transferPassword}
              onClick={handleTransfer}
            >
              {busy ? "Processando..." : "Confirmar transferencia"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">FluxPay Card</h1>
        <p className="text-sm text-flux-muted">Carteira interna da plataforma</p>
      </div>

      {card && (card.status === "approved" || card.status === "blocked") && (
        <VirtualCard
          fullName={card.full_name}
          cardNumber={card.card_number}
          status={card.status}
        />
      )}

      {card?.card_number && (
        <div className="flex justify-center">
          <button type="button" className="btn-secondary text-sm" onClick={copyNumber}>
            {copied ? "Numero copiado" : "Copiar numero"}
          </button>
        </div>
      )}

      <div className="card text-center space-y-1">
        <div className="text-xs uppercase tracking-wider text-flux-muted">
          Saldo disponivel
        </div>
        <div className="text-3xl font-semibold tracking-tight">
          {formatBRL(state?.balance.available ?? 0)}
        </div>
      </div>

      {error && <p className="text-sm text-red-400 text-center">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {status === "approved" && (
          <>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setError(null);
                setView("transfer");
              }}
            >
              Fazer transferencia
            </button>
            {!confirmBlock ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirmBlock(true)}
              >
                Bloquear carteira
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary bg-red-600 hover:bg-red-500"
                disabled={busy}
                onClick={handleBlock}
              >
                {busy ? "Bloqueando..." : "Confirmar bloqueio"}
              </button>
            )}
          </>
        )}
        {status === "blocked" && (
          <button
            type="button"
            className="btn-primary sm:col-span-2"
            disabled={busy}
            onClick={handleUnblock}
          >
            {busy ? "Desbloqueando..." : "Solicitar desbloqueio"}
          </button>
        )}
      </div>

      {receipt && view === "main" && (
        <button
          type="button"
          className="btn-secondary w-full text-sm"
          onClick={() => setView("receipt")}
        >
          Reabrir ultimo recibo
        </button>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-flux-muted shrink-0">{label}</span>
      <span className={cn("text-right break-all", mono && "font-mono text-xs")}>{value}</span>
    </div>
  );
}
