"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { Copy, Check, Loader2, QrCode, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { FluxLogo } from "@/components/brand/FluxLogo";

const API = process.env.NEXT_PUBLIC_API_URL || "";

interface Appearance {
  color: string | null;
  theme: string;
  message: string | null;
}

interface SessionData {
  id: string;
  amount: number;
  currency: string;
  status: "open" | "complete" | "expired";
  line_items: { name: string; amount: number; quantity?: number }[];
  expires_at: string | null;
  appearance?: Appearance;
}

interface PixData {
  payment_id: string;
  status: string;
  pix_copy_paste: string | null;
  pix_qr_code_base64: string | null;
  expires_at: string | null;
  simulated?: boolean;
}

function themeClasses(theme: string) {
  switch (theme) {
    case "light":
      return {
        page: "min-h-screen bg-zinc-100 flex items-center justify-center px-4 py-8 sm:py-12",
        card: "rounded-2xl border border-zinc-200 bg-white shadow-sm space-y-6 p-6 text-zinc-900",
        muted: "text-zinc-500",
        border: "border-zinc-200",
      };
    case "dark":
      return {
        page: "min-h-screen bg-black flex items-center justify-center px-4 py-8 sm:py-12",
        card: "rounded-2xl border border-zinc-800 bg-zinc-950 space-y-6 p-6 text-white",
        muted: "text-zinc-400",
        border: "border-zinc-800",
      };
    case "brand":
      return {
        page: "min-h-screen bg-flux-black surface-grid flex items-center justify-center px-4 py-8 sm:py-12",
        card: "card space-y-6",
        muted: "text-flux-muted",
        border: "border-flux-border",
      };
    default:
      return {
        page: "min-h-screen bg-flux-black surface-grid flex items-center justify-center px-4 py-8 sm:py-12",
        card: "card space-y-6",
        muted: "text-flux-muted",
        border: "border-flux-border",
      };
  }
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

  const appearance = session?.appearance;
  const accent = appearance?.color && /^#[0-9A-Fa-f]{6}$/.test(appearance.color)
    ? appearance.color
    : "#EF4444";
  const theme = appearance?.theme || "default";
  const tc = themeClasses(theme);

  const captureSuccessUrl = useCallback(async () => {
    try {
      const res = await fetch(`${API}/v1/checkout/sessions/${id}/status`);
      const json = await res.json();
      if (res.ok) successUrl.current = json.data.success_url ?? null;
    } catch {
      // ignore
    }
  }, [id]);

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch(`${API}/v1/checkout/sessions/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Sessao nao encontrada.");

      setSession(json.data);
      if (json.data.status === "complete") {
        await captureSuccessUrl();
        setStatus("paid");
      } else if (json.data.status === "expired") {
        setStatus("expired");
      } else {
        setStatus("ready");
      }
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Nao foi possivel carregar o pagamento.");
    }
  }, [id, captureSuccessUrl]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

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
        // retry
      }
    }, 4000);

    return () => clearInterval(timer);
  }, [pix, status, id]);

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
      if (!res.ok) throw new Error(json?.error?.message || "Nao foi possivel gerar o PIX.");
      setPix(json.data);
      if (json.data.status === "succeeded") setStatus("paid");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao gerar o PIX.");
    } finally {
      setGenerating(false);
    }
  }

  async function simulatePayment() {
    setSimulating(true);
    setMessage(null);
    try {
      const res = await fetch(`${API}/v1/checkout/sessions/${id}/simulate-payment`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Nao foi possivel simular.");
      await captureSuccessUrl();
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
    <div className={tc.page}>
      <div className="w-full max-w-md">
        <FluxLogo className="justify-center w-full mb-6" markClassName="w-8 h-8" textClassName="text-lg" />

        <div
          className={tc.card}
          style={
            theme === "brand" || theme === "default"
              ? { boxShadow: `0 0 0 1px ${accent}22, 0 20px 50px ${accent}15` }
              : undefined
          }
        >
          {status === "loading" && (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: accent }} />
            </div>
          )}

          {status === "error" && (
            <div className="py-8 text-center space-y-2">
              <XCircle className="w-8 h-8 text-red-400 mx-auto" />
              <p className={`text-sm ${tc.muted}`}>{message}</p>
            </div>
          )}

          {status === "expired" && (
            <div className="py-8 text-center space-y-2">
              <XCircle className="w-8 h-8 text-orange-400 mx-auto" />
              <h1 className="font-medium">Cobranca expirada</h1>
              <p className={`text-sm ${tc.muted}`}>
                Peca um novo link ao vendedor para concluir o pagamento.
              </p>
            </div>
          )}

          {status === "paid" && (
            <div className="py-8 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h1 className="font-medium text-lg">Pagamento confirmado</h1>
              <p className={`text-sm ${tc.muted}`}>
                {successUrl.current
                  ? "Redirecionando de volta para a loja..."
                  : "Voce ja pode fechar esta pagina."}
              </p>
            </div>
          )}

          {status === "ready" && session && (
            <>
              {appearance?.message && (
                <p className={`text-sm text-center ${tc.muted} leading-relaxed`}>
                  {appearance.message}
                </p>
              )}

              <div className="text-center">
                <p className={`text-sm ${tc.muted}`}>Total a pagar</p>
                <p className="text-3xl font-semibold tracking-tight mt-1">
                  {formatCurrency(session.amount, session.currency)}
                </p>
              </div>

              {session.line_items?.length > 0 && (
                <ul className={`divide-y ${tc.border} border-y ${tc.border}`}>
                  {session.line_items.map((item, i) => (
                    <li key={i} className="flex justify-between py-2.5 text-sm">
                      <span className={tc.muted}>
                        {item.name}
                        {item.quantity && item.quantity > 1 ? ` x ${item.quantity}` : ""}
                      </span>
                      <span>{formatCurrency(item.amount, session.currency)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {!pix ? (
                <button
                  className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: accent }}
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
                      <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${tc.border}`}>
                        <code className="flex-1 min-w-0 font-mono text-[11px] break-all line-clamp-3">
                          {pix.pix_copy_paste}
                        </code>
                        <button
                          className={`${tc.muted} hover:opacity-80 shrink-0 p-2 -m-1`}
                          onClick={copyCode}
                          aria-label="Copiar codigo PIX"
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

                  <div className={`flex items-center justify-center gap-2 text-sm ${tc.muted}`}>
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: accent }} />
                    Aguardando confirmacao do pagamento...
                  </div>

                  {pix.simulated && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3.5 space-y-3">
                      <p className="text-xs text-amber-200/90 leading-relaxed">
                        Ambiente de teste: este QR Code nao e valido em nenhum banco e
                        nenhum dinheiro e movimentado.
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
                        Simular confirmacao do pagamento
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

        <p className={`flex items-center justify-center gap-1.5 text-center text-xs ${tc.muted} mt-6`}>
          <ShieldCheck className="w-3.5 h-3.5" />
          Pagamento processado com seguranca pelo FluxPay
        </p>
      </div>
    </div>
  );
}
