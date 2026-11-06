"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Lock, ShieldCheck } from "lucide-react";
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
      <div className="fxb-note">
        <Lock size={18} />
        <p>As transferências Pix ficam disponíveis apenas na conta em modo de produção.</p>
      </div>
    );
  }
  if (!canTransfer) {
    return (
      <div className="fxb-note fxb-note--warn">
        <Lock size={18} />
        <p>Seu perfil não permite transferências. Peça a um administrador.</p>
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
          ? "Pix enviado e confirmado. O comprovante está em Comprovantes."
          : st === "processing"
            ? "Pix em processamento. Acompanhe em Comprovantes."
            : "Solicitação registrada. Estamos processando seu Pix."
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
      <form onSubmit={submitTransfer} className="fxb-panel fxb-form fxb-rise">
        <div className="fxb-steps" aria-hidden>
          <span data-on="true" />
          <span data-on="true" />
        </div>
        <div className="fxb-section-head" style={{ marginBottom: 0 }}>
          <div>
            <h2>Confirmar Pix</h2>
            <p>Confira os dados antes de enviar</p>
          </div>
        </div>

        <dl className="fxb-sum">
          <div>
            <dt>Tipo da chave</dt>
            <dd>{KEY_TYPES.find((t) => t.value === pixKeyType)?.label}</dd>
          </div>
          <div>
            <dt>Chave</dt>
            <dd>{pixKey}</dd>
          </div>
          <div>
            <dt>Valor</dt>
            <dd>{centsPreview != null ? formatCurrency(centsPreview, currency) : "—"}</dd>
          </div>
          <div>
            <dt>Taxa</dt>
            <dd>{formatCurrency(FEE_CENTS, currency)}</dd>
          </div>
          {description && (
            <div>
              <dt>Descrição</dt>
              <dd>{description}</dd>
            </div>
          )}
          <div className="fxb-sum-total">
            <dt>Total debitado</dt>
            <dd>{centsPreview != null ? formatCurrency(centsPreview + FEE_CENTS, currency) : "—"}</dd>
          </div>
        </dl>

        <label className="block">
          <span className="fxb-label">PIN Pix</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            autoComplete="off"
            className="w-full"
            placeholder="Digite seu PIN"
            value={pixPin}
            onChange={(e) => setPixPin(e.target.value.replace(/\D/g, ""))}
            disabled={loading}
          />
        </label>

        {error && <div className="fxb-note fxb-note--err" role="alert">{error}</div>}

        <div className="fxb-btn-row">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={loading}
            onClick={() => setStep("form")}
          >
            Voltar
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Enviando…" : "Enviar Pix"}
          </button>
        </div>
        <p className="fxb-row-sub" style={{ textAlign: "center" }}>
          <ShieldCheck size={14} style={{ display: "inline", verticalAlign: "-2px" }} /> O status final aparece em Comprovantes.
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={goConfirm} className="fxb-panel fxb-form fxb-rise">
      <div className="fxb-steps" aria-hidden>
        <span data-on="true" />
        <span data-on="false" />
      </div>

      <label className="block">
        <span className="fxb-label">Quanto você quer enviar?</span>
        <div className="fxb-amount-wrap">
          <span>R$</span>
          <input
            className="fxb-amount-input"
            inputMode="decimal"
            placeholder="0,00"
            value={amountReais}
            onChange={(e) => setAmountReais(e.target.value)}
          />
        </div>
        <p className="fxb-row-sub" style={{ marginTop: "0.5rem" }}>
          Saldo disponível: {formatCurrency(availableCents, currency)} · Taxa R$ 3,00 · Mínimo R$ 10,00
        </p>
      </label>

      <div>
        <span className="fxb-label">Tipo da chave</span>
        <div className="fxb-chips" role="radiogroup" aria-label="Tipo da chave Pix">
          {KEY_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={pixKeyType === t.value}
              data-active={pixKeyType === t.value}
              className="fxb-pill"
              onClick={() => setPixKeyType(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="fxb-label">Chave Pix</span>
        <input
          className="w-full"
          value={pixKey}
          onChange={(e) => setPixKey(e.target.value)}
          autoComplete="off"
          placeholder="Digite a chave do destinatário"
        />
      </label>

      <label className="block">
        <span className="fxb-label">Descrição (opcional)</span>
        <input
          className="w-full"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 140))}
        />
      </label>

      {error && <div className="fxb-note fxb-note--err" role="alert">{error}</div>}
      {success && <div className="fxb-note fxb-note--ok" role="status">{success}</div>}

      <button type="submit" className="btn btn-primary w-full">
        Continuar
      </button>
    </form>
  );
}
