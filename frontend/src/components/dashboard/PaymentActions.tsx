"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dashboardFetch } from "@/lib/dashboard-api";
import { friendlyError } from "@/lib/labels";
import { formatCurrency } from "@/lib/utils";
import { Alert, Modal, SubmitButton } from "@/components/dashboard/ui-client";

/**
 * Reembolso e cancelamento NÃO podem ser feitos direto pelo cliente Supabase:
 * a política do banco deixou pagamentos e reembolsos somente leitura para o
 * usuário logado, justamente porque essas ações precisam falar com o
 * adquirente. Tudo passa por /dashboard-api/payments/:id/{refund,cancel}.
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
  /** Cobrança de teste: permite confirmar o pagamento manualmente. */
  canSimulate?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"refund" | "cancel" | "simulate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"refund" | "cancel" | null>(null);

  const canRefund = status === "succeeded";
  const canCancel = status === "pending" || status === "processing";
  const showSimulate = canSimulate && status === "pending";

  if (!canWrite || (!canRefund && !canCancel && !showSimulate)) return null;

  async function simulate() {
    setBusy("simulate");
    setError(null);
    try {
      await dashboardFetch(`/payments/${paymentId}/simulate-payment`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setError(friendlyError(err, "Não foi possível confirmar a cobrança de teste."));
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
        body: action === "refund" ? { reason: "Solicitação do cliente" } : undefined,
      });
      setConfirming(null);
      router.refresh();
    } catch (err) {
      setError(
        friendlyError(
          err,
          action === "refund"
            ? "Não foi possível registrar o reembolso."
            : "Não foi possível cancelar a cobrança."
        )
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {showSimulate && (
        <SubmitButton
          type="button"
          variant="ghost"
          className="text-sm"
          loading={busy === "simulate"}
          onClick={simulate}
        >
          Confirmar teste
        </SubmitButton>
      )}
      {canCancel && (
        <button
          type="button"
          className="btn-ghost text-sm"
          onClick={() => setConfirming("cancel")}
          disabled={busy !== null}
        >
          Cancelar cobrança
        </button>
      )}
      {canRefund && (
        <button
          type="button"
          className="btn-ghost text-sm"
          onClick={() => setConfirming("refund")}
          disabled={busy !== null}
        >
          Reembolsar
        </button>
      )}

      <Modal
        open={confirming !== null}
        onClose={() => {
          setConfirming(null);
          setError(null);
        }}
        title={confirming === "refund" ? "Confirmar reembolso" : "Cancelar cobrança"}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => {
                setConfirming(null);
                setError(null);
              }}
              disabled={busy !== null}
            >
              Voltar
            </button>
            <SubmitButton
              type="button"
              className="text-sm"
              loading={busy !== null}
              onClick={() => confirming && run(confirming)}
            >
              Confirmar
            </SubmitButton>
          </>
        }
      >
        <p className="text-sm text-flux-muted leading-relaxed">
          {confirming === "refund" ? (
            <>
              O valor de{" "}
              <strong className="text-white">{formatCurrency(amount, currency)}</strong> será
              devolvido ao cliente. Para cobranças PIX, a devolução automática não está
              disponível: a operação será recusada e o valor precisa ser devolvido manualmente.
            </>
          ) : (
            <>
              A cobrança deixa de aceitar pagamento. Se o cliente já tiver pago, o cancelamento
              não desfaz o pagamento.
            </>
          )}
        </p>

        {error && <Alert>{error}</Alert>}
      </Modal>

      {error && !confirming && <Alert>{error}</Alert>}
    </div>
  );
}
