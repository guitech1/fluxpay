"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { dashboardFetch } from "@/lib/dashboard-api";
import { formatCurrency } from "@/lib/utils";

type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random";

const KEY_TYPES: { value: PixKeyType; label: string }[] = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "random", label: "Chave Aleatória" },
];

/** Mínimo de saque e taxa fixa (frontend). Backend continua a validar. */
const MIN_WITHDRAWAL_CENTS = 1000; // R$ 10,00
const FEE_CENTS = 300; // R$ 3,00

/** "1.234,56" / "1234,56" / "1234.56" -> centavos. */
function parseAmountToCents(value: string): number | null {
  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return null;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
}

function centsToBrlInput(cents: number): string {
  const reais = cents / 100;
  return reais.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function validatePixKey(type: PixKeyType, key: string): string | null {
  const v = key.trim();
  if (!v) return "Informe a chave PIX de destino.";
  if (type === "cpf") {
    const digits = v.replace(/\D/g, "");
    if (digits.length !== 11) return "CPF deve ter 11 dígitos.";
  } else if (type === "cnpj") {
    const digits = v.replace(/\D/g, "");
    if (digits.length !== 14) return "CNPJ deve ter 14 dígitos.";
  } else if (type === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "E-mail inválido.";
  } else if (type === "phone") {
    const digits = v.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 13) return "Telefone inválido.";
  } else if (type === "random") {
    if (v.length < 8) return "Chave aleatória inválida.";
  }
  return null;
}

interface Props {
  availableCents: number;
  currency: string;
  canWithdraw: boolean;
  environment: string;
  onSuccess?: () => void;
  /** Se true, renderiza como modal com cabeçalho e botão fechar */
  modal?: boolean;
  onClose?: () => void;
}

export function WithdrawForm({
  availableCents: availableCentsProp,
  currency,
  canWithdraw,
  environment,
  onSuccess,
  modal = false,
  onClose,
}: Props) {
  const router = useRouter();
  const availableCents = Number(availableCentsProp) || 0;

  const [amountReais, setAmountReais] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>("cpf");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /** MAX = saldo − taxa (não pode sacar a taxa). */
  const maxWithdrawableCents = Math.max(0, availableCents - FEE_CENTS);
  const canCoverMinAndFee = availableCents >= MIN_WITHDRAWAL_CENTS + FEE_CENTS;

  if (environment !== "live") {
    return (
      <div className="card bg-flux-gray/40 border-flux-border">
        <p className="text-sm text-flux-muted">
          Saques só estão disponíveis no ambiente de <strong>Produção</strong>. Alterne no topo do
          painel.
        </p>
      </div>
    );
  }

  if (!canWithdraw) {
    return (
      <div className="card bg-amber-500/5 border-amber-500/20">
        <p className="text-sm text-amber-200/90">
          Seu papel nesta empresa não permite solicitar saques. Peça a um administrador ou ao
          proprietário.
        </p>
      </div>
    );
  }

  function applyMax() {
    if (maxWithdrawableCents < MIN_WITHDRAWAL_CENTS) {
      setError(
        `Saldo insuficiente. É necessário pelo menos ${formatCurrency(MIN_WITHDRAWAL_CENTS + FEE_CENTS, currency)} (mínimo + taxa).`
      );
      return;
    }
    setAmountReais(centsToBrlInput(maxWithdrawableCents));
    setError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const cents = parseAmountToCents(amountReais);
    if (cents === null || cents < MIN_WITHDRAWAL_CENTS) {
      setError("Informe um valor de no mínimo R$ 10,00.");
      return;
    }
    if (cents + FEE_CENTS > availableCents) {
      setError(
        `Valor + taxa (R$ 3,00) supera o saldo disponível (${formatCurrency(availableCents, currency)}). Use MAX para o valor máximo.`
      );
      return;
    }
    if (cents > maxWithdrawableCents) {
      setError(
        `Máximo sacável: ${formatCurrency(maxWithdrawableCents, currency)} (saldo − taxa).`
      );
      return;
    }
    const keyErr = validatePixKey(pixKeyType, pixKey);
    if (keyErr) {
      setError(keyErr);
      return;
    }

    setLoading(true);
    try {
      await dashboardFetch<{ data: { id: string; status: string } }>("/withdrawals", {
        method: "POST",
        body: {
          amount: cents,
          pix_key: pixKey.trim(),
          pix_key_type: pixKeyType,
        },
      });

      setSuccess("Saque solicitado com sucesso! Processado em até 24h úteis.");
      setAmountReais("");
      setPixKey("");
      onSuccess?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao solicitar saque.");
    } finally {
      setLoading(false);
    }
  }

  const formInner = (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <p className="text-sm text-flux-muted">
          Saldo disponível:{" "}
          <span className="text-white font-medium">
            {formatCurrency(availableCents, currency)}
          </span>
        </p>
      </div>

      <label className="block text-sm">
        <span className="text-flux-muted">Valor</span>
        <div className="mt-1 relative">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className="w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2.5 pr-16 min-h-[44px] text-white"
            placeholder="0,00"
            value={amountReais}
            onChange={(e) => setAmountReais(e.target.value)}
            disabled={loading}
          />
          <button
            type="button"
            onClick={applyMax}
            disabled={loading || !canCoverMinAndFee}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase tracking-wide text-flux-red hover:text-red-400 disabled:opacity-40 px-2 py-1"
          >
            MAX
          </button>
        </div>
        <p className="mt-1.5 text-xs text-flux-muted">
          Min R$ 10,00 · Taxa R$ 3,00
        </p>
      </label>

      <label className="block text-sm">
        <span className="text-flux-muted">Tipo da chave PIX</span>
        <select
          className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2.5 min-h-[44px] text-white"
          value={pixKeyType}
          onChange={(e) => setPixKeyType(e.target.value as PixKeyType)}
          disabled={loading}
        >
          {KEY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <span className="text-flux-muted">Chave PIX</span>
        <input
          type="text"
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2.5 min-h-[44px] text-white"
          placeholder="Informe a chave"
          value={pixKey}
          onChange={(e) => setPixKey(e.target.value)}
          disabled={loading}
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-sm text-emerald-300">
          {success}
        </p>
      )}

      {!canCoverMinAndFee && !error && !success && (
        <p className="text-xs text-amber-200/80">
          Saldo insuficiente para cobrir o mínimo (R$ 10,00) e a taxa (R$ 3,00).
        </p>
      )}

      <button
        type="submit"
        className="btn-primary w-full py-3 text-base font-medium disabled:opacity-50"
        disabled={loading || !canCoverMinAndFee}
      >
        {loading ? "Enviando…" : "Confirmar Saque ↗"}
      </button>

      <p className="text-center text-xs text-flux-muted">
        Processado em até 24h úteis
      </p>
    </form>
  );

  if (modal) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdraw-title"
      >
        <div className="w-full sm:max-w-md bg-flux-dark border border-flux-border rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-flux-border">
            <h2 id="withdraw-title" className="text-lg font-semibold">
              Solicitar Saque
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-flux-muted hover:text-white hover:bg-flux-gray min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
          <div className="p-5">{formInner}</div>
        </div>
      </div>
    );
  }

  return <div className="card space-y-0">{formInner}</div>;
}
