"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dashboardFetch } from "@/lib/dashboard-api";
import { friendlyError } from "@/lib/labels";
import { formatCurrency } from "@/lib/utils";
import { paymentClientMessage } from "@/lib/payment-client-message";

type Phase = "amount" | "confirming" | "qr" | "success";

type PaymentPayload = {
  id: string;
  status: string;
  amount: number;
  provider?: string | null;
  provider_response?: unknown;
  pix_copy_paste?: string | null;
  pix_qr_code_base64?: string | null;
  payer_name?: string | null;
  client_message?: string | null;
};

function parseCents(digits: string): number {
  if (!digits) return 0;
  return Number(digits);
}

function formatFromCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function playCashSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(880, now);
    o.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + 0.4);
  } catch {
    /* silencioso */
  }
}

export function ModoCaixa() {
  const [digits, setDigits] = useState("");
  const [phase, setPhase] = useState<Phase>("amount");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentPayload | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cents = parseCents(digits);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  function applyPaymentUpdate(p: PaymentPayload) {
    setPayment(p);
    const msg = paymentClientMessage(p);
    setHint(msg);

    if (p.status === "succeeded" || p.status === "processing") {
      stopPoll();
      setPhase("success");
      playCashSound();
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate([80, 40, 80]);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    if (p.status === "failed") {
      stopPoll();
      setPhase("amount");
      setError(msg || "Não foi possível gerar o PIX. Tente de novo.");
      return;
    }

    if (p.pix_copy_paste || p.pix_qr_code_base64) {
      setPhase("qr");
      return;
    }

    // Sem QR ainda — adquirente instável / fila
    setPhase("confirming");
  }

  function startPolling(id: string) {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        // tenta drenar a fila no backend (best-effort)
        void dashboardFetch("/payments/process-provider-queue", { method: "POST", body: {} }).catch(
          () => null
        );
        const check = await dashboardFetch<{ data: PaymentPayload }>(`/payments/${id}`);
        if (check.data) applyPaymentUpdate(check.data);
      } catch {
        /* mantém polling */
      }
    }, 2500);
  }

  function press(key: string) {
    setError(null);
    if (key === "C") {
      setDigits("");
      return;
    }
    if (key === "⌫") {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    if (digits.length >= 8) return;
    setDigits((d) => (d === "0" ? key : d + key));
  }

  async function startCharge() {
    if (cents < 100) {
      setError("Valor mínimo: R$ 1,00");
      return;
    }
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await dashboardFetch<{ data: PaymentPayload }>("/payments", {
        method: "POST",
        body: {
          amount: cents,
          description: "Modo Caixa",
          expires_in_minutes: 30,
        },
      });
      const p = res.data;
      applyPaymentUpdate(p);
      startPolling(p.id);
    } catch (err) {
      setError(friendlyError(err, "Não foi possível gerar o QR. Tente de novo."));
      setPhase("amount");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    stopPoll();
    setPhase("amount");
    setPayment(null);
    setDigits("");
    setError(null);
    setHint(null);
  }

  if (phase === "success" && payment) {
    const name = payment.payer_name?.trim() || "cliente";
    return (
      <div className="fxb-caixa-success" role="status" aria-live="assertive">
        <div>
          <p style={{ fontSize: "3rem", lineHeight: 1 }}>✓</p>
          <h2>{formatCurrency(payment.amount)} recebido</h2>
          <p>de {name}</p>
          <button type="button" className="btn btn-primary" style={{ marginTop: 28 }} onClick={reset}>
            Nova venda
          </button>
        </div>
      </div>
    );
  }

  if (phase === "confirming" && payment) {
    return (
      <div className="fxb-caixa fxb-rise" role="status" aria-live="polite">
        <p style={{ textAlign: "center", color: "var(--fx-muted)", fontWeight: 700 }}>
          Conectando ao banco
        </p>
        <p className="fxb-caixa-amount">{formatCurrency(payment.amount)}</p>
        <div
          className="fxb-note"
          style={{
            margin: "0 auto",
            maxWidth: 360,
            textAlign: "center",
            borderColor: "rgba(56, 189, 248, 0.35)",
            background: "rgba(14, 165, 233, 0.12)",
          }}
        >
          <p style={{ fontWeight: 700, marginBottom: 6 }}>Aguarde nesta tela</p>
          <p>
            {hint ||
              "Estamos gerando seu PIX. Não feche e não peça ao cliente para pagar de outro lugar."}
          </p>
        </div>
        <p style={{ textAlign: "center", color: "var(--fx-muted)", fontSize: "0.85rem" }}>
          Retentativa automática em andamento…
        </p>
        <button type="button" className="btn btn-secondary" onClick={reset}>
          Cancelar
        </button>
      </div>
    );
  }

  if (phase === "qr" && payment) {
    const qr = payment.pix_qr_code_base64 || "";
    const src = qr.startsWith("data:") ? qr : qr ? `data:image/png;base64,${qr}` : "";
    return (
      <div className="fxb-caixa fxb-rise">
        <p style={{ textAlign: "center", color: "var(--fx-muted)", fontWeight: 700 }}>
          Mostre o QR para o cliente
        </p>
        <p className="fxb-caixa-amount">{formatCurrency(payment.amount)}</p>
        {hint ? (
          <div className="fxb-note fxb-note--warn" style={{ textAlign: "center" }}>
            {hint}
          </div>
        ) : null}
        <div className="fxb-caixa-qr">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="QR Code PIX" />
          ) : (
            <p style={{ padding: 24, textAlign: "center" }}>QR indisponível — use o copia e cola</p>
          )}
          {payment.pix_copy_paste ? (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: "100%" }}
              onClick={() => navigator.clipboard?.writeText(payment.pix_copy_paste || "")}
            >
              Copiar código PIX
            </button>
          ) : null}
        </div>
        <p style={{ textAlign: "center", color: "var(--fx-muted)", fontSize: "0.9rem" }}>
          Aguardando pagamento…
        </p>
        <button type="button" className="btn btn-secondary" onClick={reset}>
          Cancelar
        </button>
      </div>
    );
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"];

  return (
    <div className="fxb-caixa fxb-rise">
      <p style={{ textAlign: "center", color: "var(--fx-muted)", fontWeight: 700 }}>
        Digite o valor da venda
      </p>
      <p className="fxb-caixa-amount">
        <small style={{ fontSize: "0.4em", opacity: 0.7 }}>R$ </small>
        {formatFromCents(cents)}
      </p>
      {error ? <div className="fxb-note fxb-note--err">{error}</div> : null}
      <div className="fxb-caixa-pad">
        {keys.map((k) => (
          <button key={k} type="button" className="fxb-caixa-key" onClick={() => press(k)}>
            {k}
          </button>
        ))}
        <button
          type="button"
          className="fxb-caixa-key fxb-caixa-key--go"
          disabled={loading || cents < 100}
          onClick={startCharge}
        >
          {loading ? "Gerando…" : "Gerar QR Code"}
        </button>
      </div>
    </div>
  );
}
