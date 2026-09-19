"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { dashboardFetch } from "@/lib/dashboard-api";
import { formatCurrency } from "@/lib/utils";

/**
 * Reembolso e cancelamento NAO podem ser feitos direto pelo Supabase client:
 * a migration 010 deixou payments/refunds somente leitura para o usuario
 * logado, justamente porque essas acoes precisam falar com o adquirente.
 * Tudo passa por /dashboard-api/payments/:id/{refund,cancel}.
 */
export function PaymentActions({
  paymentId,
  status,
  amount,
  currency,
  canWrite,
  canSimulate = false,
}: {
  paymentId: string;
  status: string;
  amount: number;
  currency: string;
  canWrite: boolean;
  /** Cobranca PIX simulada (ambiente de teste, provider sandbox). */
  canSimulate?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"refund" | "cancel" | "simulate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"refund" | "cancel" | null>(null);

  const canRefund = status === "succeeded";
  const canCancel = status === "pending" || status === "processing";
  const showSimulate = canSimulate && status === "pending";

  if (!canWrite || (!canRefund && !canCancel && !showSimulate)) {
    return <span className="text-flux-muted text-xs">—</span>;
  }

  async function simulate() {
    setBusy("simulate");
    setError(null);
    try {
      await dashboardFetch(`/payments/${paymentId}/simulate-payment`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao simular o pagamento.");
    } finally {
      setBusy(null);
    }
  }

  async function run(action: "refund" | "cancel") {
    setBusy(action);
    setError(null);
    try {
      await dashboardFetch(`/payments/${paymentId}/${action}`, {
        method: "POST",
        body: action === "refund" ? { reason: "requested_by_customer" } : undefined,
      });
      setConfirming(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na operação.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-3">
        {showSimulate && (
          <button
            className="text-xs text-amber-300 hover:text-amber-200 underline underline-offset-2 disabled:opacity-50"
            onClick={simulate}
            disabled={busy !== null}
            title="Ambiente de teste: confirma a cobranca sem adquirente e sem dinheiro real"
          >
            {busy === "simulate" ? "Simulando..." : "Simular pagamento"}
          </button>
        )}
        {canRefund && (
          <button
            className="text-xs text-flux-muted hover:text-white underline underline-offset-2 disabled:opacity-50"
            onClick={() => setConfirming("refund")}
            disabled={busy !== null}
          >
            Reembolsar
          </button>
        )}
        {canCancel && (
          <button
            className="text-xs text-flux-muted hover:text-white underline underline-offset-2 disabled:opacity-50"
            onClick={() => setConfirming("cancel")}
            disabled={busy !== null}
          >
            Cancelar
          </button>
        )}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="card w-full max-w-md space-y-4">
            <h3 className="font-medium">
              {confirming === "refund" ? "Confirmar reembolso" : "Cancelar cobrança"}
            </h3>
            <p className="text-sm text-flux-muted">
              {confirming === "refund" ? (
                <>
                  O valor de <strong className="text-white">{formatCurrency(amount, currency)}</strong>{" "}
                  será devolvido ao cliente. Em PIX pela NexusPag, o estorno automático não é
                  suportado — a operação vai falhar com uma mensagem explicando isso, e a devolução
                  precisa ser feita manualmente.
                </>
              ) : (
                <>A cobrança deixa de aceitar pagamento. Se o cliente já pagou, cancelar não desfaz.</>
              )}
            </p>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                className="btn-secondary text-sm"
                onClick={() => {
                  setConfirming(null);
                  setError(null);
                }}
                disabled={busy !== null}
              >
                Voltar
              </button>
              <button
                className="btn-primary text-sm flex items-center gap-2"
                onClick={() => run(confirming)}
                disabled={busy !== null}
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
