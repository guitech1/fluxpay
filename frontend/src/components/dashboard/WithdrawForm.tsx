"use client";

import { useState } from "react";
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

interface Props {
  availableCents: number;
  currency: string;
  canWithdraw: boolean;
  environment: string;
  onSuccess?: () => void;
}

export function WithdrawForm({
  availableCents,
  currency,
  canWithdraw,
  environment,
  onSuccess,
}: Props) {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const reais = parseFloat(amountReais.replace(",", "."));
    if (!Number.isFinite(reais) || reais < 10) {
      setError("Informe um valor de no mínimo R$ 10,00.");
      return;
    }
    const cents = Math.round(reais * 100);
    if (cents > availableCents) {
      setError("Valor acima do saldo disponível.");
      return;
    }
    if (!pixKey.trim()) {
      setError("Informe a chave PIX de destino.");
      return;
    }

    setLoading(true);
    try {
      const res = await dashboardFetch<{ data: { id: string; status: string } }>("/withdrawals", {
        method: "POST",
        body: {
          amount: cents,
          pix_key: pixKey.trim(),
          pix_key_type: pixKeyType,
        },
      });
      setSuccess(
        `Pedido criado (${res.data.id.slice(0, 8)}…). Status: ${res.data.status}. Aguardando aprovação.`
      );
      setAmountReais("");
      setPixKey("");
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao solicitar saque.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
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
            className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2"
            placeholder="10,00"
            value={amountReais}
            onChange={(e) => setAmountReais(e.target.value)}
            disabled={loading}
          />
        </label>
        <label className="block text-sm">
          <span className="text-flux-muted">Tipo da chave</span>
          <select
            className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2"
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
          className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2"
          placeholder="CPF, e-mail, telefone ou chave"
          value={pixKey}
          onChange={(e) => setPixKey(e.target.value)}
          disabled={loading}
        />
      </label>

      {error && <p className="text-sm text-red-300">{error}</p>}
      {success && <p className="text-sm text-emerald-300">{success}</p>}

      <button type="submit" className="btn-primary" disabled={loading || availableCents < 1000}>
        {loading ? "Enviando…" : "Solicitar saque"}
      </button>
    </form>
  );
}
