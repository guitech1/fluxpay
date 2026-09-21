"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { dashboardFetch } from "@/lib/dashboard-api";
import { formatCurrency } from "@/lib/utils";

type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random" | "qrc";

const KEY_TYPES: { value: PixKeyType; label: string }[] = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "random", label: "Chave aleatória" },
  { value: "qrc", label: "PIX copia e cola" },
];

const MIN_WITHDRAWAL_CENTS = 300;

/** "1.234,56" / "1234,56" / "1234.56" -> centavos. Mesmo padrão de NewPaymentForm. */
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

interface Props {
  availableCents: number;
  currency: string;
  canWithdraw: boolean;
  environment: string;
  onSuccess?: () => void;
}

export function WithdrawForm({
  availableCents: availableCentsProp,
  currency,
  canWithdraw,
  environment,
  onSuccess,
}: Props) {
  const router = useRouter();
  // RPC BIGINT pode chegar como string em alguns clientes; force number.
  const availableCents = Number(availableCentsProp) || 0;

  const [amountReais, setAmountReais] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>("cpf");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const cents = parseAmountToCents(amountReais);
    if (cents === null || cents < MIN_WITHDRAWAL_CENTS) {
      setError("Informe um valor de no mínimo R$ 3,00.");
      return;
    }
    if (cents > availableCents) {
      setError(
        `Valor acima do saldo disponível (${formatCurrency(availableCents, currency)}).`
      );
      return;
    }
    if (!pixKey.trim()) {
      setError("Informe a chave PIX de destino.");
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

      setSuccess(
        "Saque solicitado com sucesso! Aguarde até 24 horas para processamento."
      );
      setAmountReais("");
      setPixKey("");
      onSuccess?.();
      // Atualiza saldo e extrato (Server Component da carteira).
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao solicitar saque.");
    } finally {
      setLoading(false);
    }
  }

  const belowMinimum = availableCents < MIN_WITHDRAWAL_CENTS;

  return (
    <form onSubmit={handleSubmit} className="card space-y-4" noValidate>
      <div>
        <h3 className="text-sm font-medium">Solicitar saque</h3>
        <p className="text-xs text-flux-muted mt-1">
          Disponível: {formatCurrency(availableCents, currency)}. O valor é reservado no extrato;
          a transferência ocorre após aprovação da plataforma.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-flux-muted">Valor (R$)</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2 min-h-[44px]"
            placeholder="3,00"
            value={amountReais}
            onChange={(e) => setAmountReais(e.target.value)}
            disabled={loading}
          />
        </label>
        <label className="block text-sm">
          <span className="text-flux-muted">Tipo da chave</span>
          <select
            className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2 min-h-[44px]"
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
      </div>

      <label className="block text-sm">
        <span className="text-flux-muted">Chave PIX</span>
        <input
          type="text"
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2 min-h-[44px]"
          placeholder="CPF, e-mail, telefone ou chave"
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

      {belowMinimum && !error && !success && (
        <p className="text-xs text-flux-muted">
          Saldo mínimo para saque: R$ 3,00.
        </p>
      )}

      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? "Enviando…" : "Solicitar saque"}
      </button>
    </form>
  );
}
