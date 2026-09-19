"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dashboardFetch } from "@/lib/dashboard-api";
import { friendlyError } from "@/lib/labels";
import { formatCurrency } from "@/lib/utils";
import { Alert, CopyButton, SubmitButton } from "@/components/dashboard/ui-client";

/**
 * Painel da cobrança PIX: QR Code, copia e cola e o status ao vivo.
 *
 * Quem muda o status de um PIX é o webhook de confirmação do adquirente
 * chegando no backend — nunca esta tela. Aqui só perguntamos de tempos em
 * tempos, lendo a própria linha do pagamento (a política do banco já limita
 * a leitura aos membros da empresa).
 *
 * O bloco de confirmação simulada só existe quando o backend marcou a
 * cobrança como sendo do provider de teste. Em produção ele não é
 * renderizado e a rota correspondente responde 404 — não há caminho em que
 * uma simulação apareça como pagamento real.
 */

const FINAL_STATUSES = ["succeeded", "failed", "canceled", "expired", "refunded"];

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) return;

    function tick() {
      setRemaining(Math.max(0, new Date(expiresAt as string).getTime() - Date.now()));
    }

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  if (remaining === null) return null;

  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (totalSeconds <= 0) return "expirada";
  if (hours > 24) return `${Math.floor(hours / 24)} dias`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}min`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function PixChargePanel({
  paymentId,
  initialStatus,
  amount,
  currency,
  copyPaste,
  qrCodeBase64,
  expiresAt,
  isSimulated,
  canWrite,
}: {
  paymentId: string;
  initialStatus: string;
  amount: number;
  currency: string;
  copyPaste: string | null;
  qrCodeBase64: string | null;
  expiresAt: string | null;
  /** Cobrança criada pelo provider de teste: nada aqui é dinheiro real. */
  isSimulated: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countdown = useCountdown(expiresAt);

  const isPending = !FINAL_STATUSES.includes(status);

  // Enquanto pendente, verifica o status a cada 5 segundos.
  const check = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("payments")
      .select("status")
      .eq("id", paymentId)
      .maybeSingle();

    if (data?.status && data.status !== status) {
      setStatus(data.status);
      // Atualiza o resto da página (data de pagamento, histórico, saldo).
      router.refresh();
    }
  }, [paymentId, status, router]);

  useEffect(() => {
    if (!isPending) return;
    const timer = setInterval(check, 5000);
    return () => clearInterval(timer);
  }, [isPending, check]);

  async function simulate() {
    setSimulating(true);
    setError(null);
    try {
      await dashboardFetch(`/payments/${paymentId}/simulate-payment`, { method: "POST" });
      setStatus("succeeded");
      router.refresh();
    } catch (err) {
      setError(friendlyError(err, "Não foi possível confirmar a cobrança de teste."));
    } finally {
      setSimulating(false);
    }
  }

  if (status === "succeeded") {
    return (
      <div className="card text-center py-10">
        <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
        <p className="font-medium mt-4">Pagamento confirmado</p>
        <p className="text-2xl font-semibold tracking-tight mt-2">
          {formatCurrency(amount, currency)}
        </p>
        <p className="text-sm text-flux-muted mt-2">
          O valor entra no seu saldo e aparece na carteira.
        </p>
      </div>
    );
  }

  if (status === "expired" || status === "canceled" || status === "failed") {
    const texts: Record<string, { title: string; desc: string }> = {
      expired: {
        title: "Cobrança expirada",
        desc: "O prazo de pagamento terminou. Crie uma nova cobrança para o mesmo valor.",
      },
      canceled: {
        title: "Cobrança cancelada",
        desc: "Esta cobrança não aceita mais pagamento.",
      },
      failed: {
        title: "Cobrança não concluída",
        desc: "Não foi possível concluir esta cobrança. Crie uma nova para tentar de novo.",
      },
    };
    const text = texts[status];

    return (
      <div className="card text-center py-10">
        <XCircle className="w-9 h-9 text-flux-muted mx-auto" />
        <p className="font-medium mt-4">{text.title}</p>
        <p className="text-sm text-flux-muted mt-1.5 max-w-xs mx-auto">{text.desc}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-5">
        <div className="text-center">
          <p className="text-sm text-flux-muted">Valor da cobrança</p>
          <p className="text-3xl font-semibold tracking-tight mt-1">
            {formatCurrency(amount, currency)}
          </p>
        </div>

        {qrCodeBase64 && (
          <div className="bg-white rounded-xl p-4 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                qrCodeBase64.startsWith("data:")
                  ? qrCodeBase64
                  : `data:image/png;base64,${qrCodeBase64}`
              }
              alt="QR Code para pagamento por PIX"
              className="w-44 h-44 sm:w-52 sm:h-52"
            />
          </div>
        )}

        {copyPaste && (
          <div>
            <p className="text-sm font-medium mb-1.5">PIX copia e cola</p>
            <div className="flex items-center gap-1 bg-flux-gray border border-flux-border rounded-lg pl-3 pr-1 py-1">
              <code className="flex-1 min-w-0 font-mono text-[11px] break-all line-clamp-2 py-1.5">
                {copyPaste}
              </code>
              <CopyButton value={copyPaste} iconOnly label="Copiar código PIX" />
            </div>
            <div className="mt-2.5">
              <CopyButton value={copyPaste} label="Copiar código" copiedLabel="Código copiado" />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 border-t border-flux-border pt-4 text-sm">
          <span className="flex items-center gap-2 text-flux-muted">
            <Loader2 className="w-4 h-4 animate-spin" />
            Aguardando pagamento
          </span>
          {countdown && (
            <span className="flex items-center gap-1.5 text-flux-muted whitespace-nowrap">
              <Clock className="w-3.5 h-3.5" />
              {countdown === "expirada" ? "Expirando" : `Expira em ${countdown}`}
            </span>
          )}
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {/*
        Bloco exclusivo do ambiente de teste. Fica visualmente separado do
        restante da tela justamente para não se confundir com uma cobrança
        real — e o botão chama uma rota que só existe para provider de teste.
      */}
      {isSimulated && canWrite && (
        <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-amber-100">Cobrança de teste</p>
            <p className="text-xs text-amber-100/70 mt-1 leading-relaxed">
              Este código não é válido em nenhum banco e nenhum valor é movimentado. Confirme
              manualmente para testar o restante do fluxo: saldo, webhooks e histórico.
            </p>
          </div>
          <SubmitButton
            type="button"
            loading={simulating}
            onClick={simulate}
            variant="secondary"
            className="w-full sm:w-auto"
          >
            Confirmar pagamento de teste
          </SubmitButton>
        </div>
      )}
    </div>
  );
}
