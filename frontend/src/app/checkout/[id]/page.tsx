"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { Copy, Check, Loader2, QrCode, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { FluxLogo } from "@/components/brand/FluxLogo";

/**
 * Pagina publica de checkout — quem abre e o cliente final do lojista, sem
 * login e sem API key. Por isso ela nao usa o Supabase client (a RLS bloqueia
 * anon em checkout_sessions, de proposito) e fala so com as rotas publicas do
 * backend:
 *   GET  /v1/checkout/sessions/:id         -> dados publicos da sessao
 *   POST /v1/checkout/sessions/:id/pay     -> gera (ou reaproveita) o PIX
 *   GET  /v1/checkout/sessions/:id/status  -> polling ate o webhook confirmar
 *
 * PIX nao confirma de forma sincrona: quem muda o status e o webhook da
 * NexusPag chegando no backend. Daqui, so resta perguntar de tempos em tempos.
 */

const API = process.env.NEXT_PUBLIC_API_URL || "";

interface SessionData {
  id: string;
  amount: number;
  currency: string;
  status: "open" | "complete" | "expired";
  line_items: { name: string; amount: number; quantity?: number }[];
  expires_at: string | null;
}

interface PixData {
  payment_id: string;
  status: string;
  pix_copy_paste: string | null;
  pix_qr_code_base64: string | null;
  expires_at: string | null;
  /** true quando a cobranca foi criada pelo provider sandbox (ambiente de teste). */
  simulated?: boolean;
}

export default function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [session, setSession] = useState<SessionData | null>(null);
  const [pix, setPix] = useState<PixData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "paid" | "expired" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const successUrl = useRef<string | null>(null);

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch(`${API}/v1/checkout/sessions/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Sessão não encontrada.");

      setSession(json.data);
      if (json.data.status === "complete") setStatus("paid");
      else if (json.data.status === "expired") setStatus("expired");
      else setStatus("ready");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Não foi possível carregar o pagamento.");
    }
  }, [id]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Polling: o PIX so vira "pago" quando o webhook da NexusPag chega no backend.
  useEffect(() => {
    if (!pix || status !== "ready") return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${API}/v1/checkout/sessions/${id}/status`);
        const json = await res.json();
        if (!res.ok) return;

        if (json.data.payment_status === "succeeded" || json.data.status === "complete") {
          setStatus("paid");
          successUrl.current = json.data.success_url ?? null;
        } else if (json.data.status === "expired" || json.data.payment_status === "expired") {
          setStatus("expired");
        }
      } catch {
        // Falha de rede no polling nao muda nada: tenta de novo no proximo tick.
      }
    }, 4000);

    return () => clearInterval(timer);
  }, [pix, status, id]);

  // Redireciona para o success_url do lojista, quando houver.
  useEffect(() => {
    if (status !== "paid" || !successUrl.current) return;
    const timer = setTimeout(() => {
      window.location.href = successUrl.current as string;
    }, 2500);
    return () => clearTimeout(timer);
  }, [status]);

  async function generatePix() {
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch(`${API}/v1/checkout/sessions/${id}/pay`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Não foi possível gerar o PIX.");
      setPix(json.data);
      if (json.data.status === "succeeded") setStatus("paid");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao gerar o PIX.");
    } finally {
      setGenerating(false);
    }
  }

  /**
   * So aparece quando o backend marca a cobranca como simulada (ambiente de
   * teste). Em producao o botao nao existe e a rota devolve 404 — quem
   * confirma um PIX de verdade e o webhook da NexusPag.
   */
  async function simulatePayment() {
    setSimulating(true);
    setMessage(null);
    try {
      const res = await fetch(`${API}/v1/checkout/sessions/${id}/simulate-payment`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Não foi possível simular.");
      setStatus("paid");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao simular o pagamento.");
    } finally {
      setSimulating(false);
    }
  }

  async function copyCode() {
    if (!pix?.pix_copy_paste) return;
    await navigator.clipboard.writeText(pix.pix_copy_paste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-flux-black surface-grid flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-md">
        <FluxLogo className="justify-center w-full mb-6" markClassName="w-8 h-8" textClassName="text-lg" />

        <div className="card space-y-6">
          {status === "loading" && (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-flux-muted" />
            </div>
          )}

          {status === "error" && (
            <div className="py-8 text-center space-y-2">
              <XCircle className="w-8 h-8 text-red-400 mx-auto" />
              <p className="text-sm text-flux-muted">{message}</p>
            </div>
          )}

          {status === "expired" && (
            <div className="py-8 text-center space-y-2">
              <XCircle className="w-8 h-8 text-orange-400 mx-auto" />
              <h1 className="font-medium">Cobrança expirada</h1>
              <p className="text-sm text-flux-muted">
                Peça um novo link ao vendedor para concluir o pagamento.
              </p>
            </div>
          )}

          {status === "paid" && (
            <div className="py-8 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h1 className="font-medium text-lg">Pagamento confirmado</h1>
              <p className="text-sm text-flux-muted">
                {successUrl.current
                  ? "Redirecionando de volta para a loja..."
                  : "Você já pode fechar esta página."}
              </p>
            </div>
          )}

          {status === "ready" && session && (
            <>
              <div className="text-center">
                <p className="text-sm text-flux-muted">Total a pagar</p>
                <p className="text-3xl font-semibold tracking-tight mt-1">
                  {formatCurrency(session.amount, session.currency)}
                </p>
              </div>

              {session.line_items?.length > 0 && (
                <ul className="divide-y divide-flux-border border-y border-flux-border">
                  {session.line_items.map((item, i) => (
                    <li key={i} className="flex justify-between py-2.5 text-sm">
                      <span className="text-flux-muted">
                        {item.name}
                        {item.quantity && item.quantity > 1 ? ` × ${item.quantity}` : ""}
                      </span>
                      <span>{formatCurrency(item.amount, session.currency)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {!pix ? (
                <button
                  className="btn-primary w-full flex items-center justify-center gap-2"
                  onClick={generatePix}
                  disabled={generating}
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                  Pagar com PIX
                </button>
              ) : (
                <div className="space-y-4">
                  {pix.pix_qr_code_base64 && (
                    <div className="bg-white rounded-xl p-4 flex justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={
                          pix.pix_qr_code_base64.startsWith("data:")
                            ? pix.pix_qr_code_base64
                            : `data:image/png;base64,${pix.pix_qr_code_base64}`
                        }
                        alt="QR Code PIX"
                        className="w-44 h-44 sm:w-52 sm:h-52"
                      />
                    </div>
                  )}

                  {pix.pix_copy_paste && (
                    <div>
                      <p className="text-sm font-medium mb-1.5">PIX copia e cola</p>
                      <div className="flex items-center gap-2 bg-flux-gray border border-flux-border rounded-lg px-3 py-2">
                        <code className="flex-1 min-w-0 font-mono text-[11px] break-all line-clamp-3">
                          {pix.pix_copy_paste}
                        </code>
                        <button
                          className="text-flux-muted hover:text-white shrink-0 p-2 -m-1"
                          onClick={copyCode}
                          aria-label="Copiar código PIX"
                        >
                          {copied ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-center gap-2 text-sm text-flux-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Aguardando confirmação do pagamento...
                  </div>

                  {pix.simulated && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3.5 space-y-3">
                      <p className="text-xs text-amber-200/90 leading-relaxed">
                        Ambiente de teste: este QR Code não é válido em nenhum banco e
                        nenhum dinheiro é movimentado.
                      </p>
                      <button
                        className="btn-secondary w-full"
                        onClick={simulatePayment}
                        disabled={simulating}
                      >
                        {simulating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                        Simular confirmação do pagamento
                      </button>
                    </div>
                  )}
                </div>
              )}

              {message && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-300">
                  {message}
                </div>
              )}
            </>
          )}
        </div>

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-flux-muted mt-6">
          <ShieldCheck className="w-3.5 h-3.5" />
          Pagamento processado com segurança pelo FluxPay
        </p>
      </div>
    </div>
  );
}
