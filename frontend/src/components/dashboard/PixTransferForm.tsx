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
  { value: "random", label: "Chave aleatória" },
];

const MIN_CENTS = 1000;
const FEE_CENTS = 300;

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
  canTransfer: boolean;
  environment: string;
}

export function PixTransferForm({
  availableCents: availableCentsProp,
  currency,
  canTransfer,
  environment,
}: Props) {
  const router = useRouter();
  const availableCents = Number(availableCentsProp) || 0;
  const [amountReais, setAmountReais] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>("cpf");
  const [description, setDescription] = useState("");
  const [pixPin, setPixPin] = useState("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (environment !== "live") {
    return (
      <div className="rounded-xl border border-flux-border bg-flux-gray/40 p-4 text-sm text-flux-muted">
        Transferências Pix só no ambiente de <strong>Produção</strong>.
      </div>
    );
  }
  if (!canTransfer) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200/90">
        Seu papel não permite transferências. Peça a um administrador.
      </div>
    );
  }

  function goConfirm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const cents = parseAmountToCents(amountReais);
    if (cents === null || cents < MIN_CENTS) {
      setError("Valor mínimo R$ 10,00.");
      return;
    }
    if (cents + FEE_CENTS > availableCents) {
      setError("Saldo insuficiente para valor + taxa (R$ 3,00).");
      return;
    }
    if (!pixKey.trim()) {
      setError("Informe a chave Pix.");
      return;
    }
    setStep("confirm");
  }

  async function submitTransfer(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!/^\d{4,8}$/.test(pixPin)) {
      setError("Informe o PIN Pix (4 a 8 dígitos).");
      return;
    }
    const cents = parseAmountToCents(amountReais)!;
    setLoading(true);
    try {
      // Valida PIN Pix no backend antes do saque
      await dashboardFetch("/digital-account/pix-pin/verify", {
        method: "POST",
        body: { pix_pin: pixPin },
      });

      const correlation_id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const result = await dashboardFetch<{ data: { id: string; status: string } }>(
        "/withdrawals",
        {
          method: "POST",
          body: {
            amount: cents,
            pix_key: pixKey.trim(),
            pix_key_type: pixKeyType,
            correlation_id,
          },
        }
      );

      const st = result?.data?.status || "pending";
      setSuccess(
        st === "completed"
          ? "Transferência enviada e confirmada pelo provedor."
          : st === "processing"
            ? "Transferência em processamento no provedor."
            : "Solicitação registrada. Aguardando processamento/aprovação."
      );
      setAmountReais("");
      setPixKey("");
      setPixPin("");
      setDescription("");
      setStep("form");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na transferência.");
    } finally {
      setLoading(false);
    }
  }

  const centsPreview = parseAmountToCents(amountReais);

  if (step === "confirm") {
    return (
      <form onSubmit={submitTransfer} className="space-y-4 card">
        <h3 className="font-medium">Confirmar transferência Pix</h3>
        <dl className="text-sm space-y-2">
          <div className="flex justify-between gap-4">
            <dt className="text-flux-muted">Tipo</dt>
            <dd className="uppercase">{pixKeyType}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-flux-muted">Chave</dt>
            <dd className="font-mono text-right break-all">{pixKey}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-flux-muted">Valor ao destinatário</dt>
            <dd className="font-medium">
              {centsPreview != null ? formatCurrency(centsPreview, currency) : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-flux-muted">Taxa</dt>
            <dd>{formatCurrency(FEE_CENTS, currency)}</dd>
          </div>
          {description && (
            <div className="flex justify-between gap-4">
              <dt className="text-flux-muted">Descrição</dt>
              <dd>{description}</dd>
            </div>
          )}
        </dl>
        <label className="block text-sm">
          <span className="text-flux-muted">PIN Pix</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2.5 text-white"
            value={pixPin}
            onChange={(e) => setPixPin(e.target.value.replace(/\D/g, ""))}
            disabled={loading}
          />
        </label>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary flex-1"
            disabled={loading}
            onClick={() => setStep("form")}
          >
            Voltar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={loading}>
            {loading ? "Enviando…" : "Confirmar saída"}
          </button>
        </div>
        <p className="text-xs text-flux-muted">
          Operação de saída via saque NexusPag. O status final depende da confirmação do provedor.
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={goConfirm} className="space-y-4 card">
      <h3 className="font-medium">Transferir por chave Pix</h3>
      <p className="text-xs text-flux-muted">
        Saldo disponível: {formatCurrency(availableCents, currency)} · Taxa R$ 3,00
      </p>
      <label className="block text-sm">
        <span className="text-flux-muted">Tipo da chave</span>
        <select
          className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2.5 text-white"
          value={pixKeyType}
          onChange={(e) => setPixKeyType(e.target.value as PixKeyType)}
        >
          {KEY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-flux-muted">Chave Pix</span>
        <input
          className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2.5 text-white"
          value={pixKey}
          onChange={(e) => setPixKey(e.target.value)}
          autoComplete="off"
        />
      </label>
      <label className="block text-sm">
        <span className="text-flux-muted">Valor</span>
        <input
          className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2.5 text-white"
          inputMode="decimal"
          placeholder="0,00"
          value={amountReais}
          onChange={(e) => setAmountReais(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="text-flux-muted">Descrição (opcional)</span>
        <input
          className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2.5 text-white"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 140))}
        />
      </label>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {success && <p className="text-sm text-emerald-300">{success}</p>}
      <button type="submit" className="btn-primary w-full py-3">
        Continuar
      </button>
    </form>
  );
}
