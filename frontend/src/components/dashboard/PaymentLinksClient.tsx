"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Link2, Loader2, QrCode, Share2 } from "lucide-react";
import { dashboardFetch } from "@/lib/dashboard-api";
import { friendlyError } from "@/lib/labels";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Alert, CopyButton, SubmitButton } from "@/components/dashboard/ui-client";
import { StatusBadge } from "@/components/dashboard/ui";

const EXPIRY_OPTIONS = [
  { minutes: 30, label: "30 minutos" },
  { minutes: 60, label: "1 hora" },
  { minutes: 1440, label: "24 horas" },
  { minutes: 4320, label: "3 dias" },
  { minutes: 10080, label: "7 dias" },
];

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

type PaymentLinkResult = {
  id: string;
  url: string;
  amount: number;
  currency: string;
  description: string;
  status: string;
  expires_at: string | null;
  payment_id: string;
  payment_status: string;
  pix_copy_paste: string | null;
  pix_qr_code_base64: string | null;
  simulated?: boolean;
};

type PaymentLinkListItem = {
  id: string;
  url: string;
  amount: number;
  currency: string;
  description: string;
  status: string;
  payment_status: string | null;
  expires_at: string | null;
  created_at: string;
};

export function PaymentLinksClient({ canWrite }: { canWrite: boolean }) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [expiry, setExpiry] = useState(1440);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentLinkResult | null>(null);
  const [history, setHistory] = useState<PaymentLinkListItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const cents = useMemo(() => parseAmountToCents(amount), [amount]);
  const amountValid = cents !== null && cents >= 100;

  const loadHistory = useCallback(async () => {
    try {
      const res = await dashboardFetch<{ data: PaymentLinkListItem[] }>("/payment-links");
      setHistory(res.data || []);
    } catch {
      // lista secundaria
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canWrite) {
      setError("Voce nao tem permissao para criar links de pagamento.");
      return;
    }
    if (!amountValid) {
      setError("Informe um valor de pelo menos R$ 1,00.");
      return;
    }
    setLoading(true);
    try {
      const res = await dashboardFetch<{ data: PaymentLinkResult }>("/payment-links", {
        method: "POST",
        body: {
          amount: cents,
          description: description.trim() || undefined,
          expires_in_minutes: expiry,
        },
      });
      setResult(res.data);
      setAmount("");
      setDescription("");
      void loadHistory();
    } catch (err) {
      setError(friendlyError(err, "Nao foi possivel gerar o link. Tente novamente."));
    } finally {
      setLoading(false);
    }
  }

  function shareWhatsApp(url: string, amountCents: number, currency: string) {
    const text = `Segue o link para pagamento de ${formatCurrency(amountCents, currency)}:\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <form onSubmit={handleGenerate} className="lg:col-span-2 card space-y-5">
          <div>
            <h2 className="font-medium">Novo link</h2>
            <p className="text-sm text-flux-muted mt-1">
              Informe o valor e envie o link com QR Code e PIX copia e cola.
            </p>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <div>
            <label htmlFor="pl-amount" className="label">Valor</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-flux-muted text-sm pointer-events-none">R$</span>
              <input
                id="pl-amount"
                className="input pl-10 text-lg"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                autoFocus
                disabled={!canWrite || loading}
              />
            </div>
          </div>
          <div>
            <label htmlFor="pl-desc" className="label">Descricao (opcional)</label>
            <input
              id="pl-desc"
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Pedido 123"
              maxLength={200}
              disabled={!canWrite || loading}
            />
          </div>
          <div>
            <label htmlFor="pl-expiry" className="label">Validade</label>
            <select
              id="pl-expiry"
              className="input"
              value={expiry}
              onChange={(e) => setExpiry(Number(e.target.value))}
              disabled={!canWrite || loading}
            >
              {EXPIRY_OPTIONS.map((opt) => (
                <option key={opt.minutes} value={opt.minutes}>{opt.label}</option>
              ))}
            </select>
          </div>
          <SubmitButton type="submit" loading={loading} disabled={!canWrite || !amountValid} className="w-full">
            <Link2 className="w-4 h-4" />
            Gerar link de pagamento
          </SubmitButton>
        </form>

        <div className="lg:col-span-3">
          {!result ? (
            <div className="card border-dashed text-center py-14 px-6">
              <QrCode className="w-10 h-10 text-flux-muted mx-auto opacity-50" />
              <p className="mt-4 text-flux-muted text-sm max-w-sm mx-auto">
                O link, o QR Code e o codigo PIX aparecem aqui depois de gerar.
              </p>
            </div>
          ) : (
            <div className="card space-y-5">
              {result.simulated && (
                <Alert tone="info">Ambiente de teste: este PIX e simulado e nao movimenta dinheiro real.</Alert>
              )}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-flux-muted">Valor</p>
                  <p className="text-2xl font-semibold tracking-tight">{formatCurrency(result.amount, result.currency)}</p>
                  <p className="text-sm text-flux-muted mt-1">{result.description}</p>
                </div>
                <StatusBadge status={result.payment_status === "succeeded" ? "succeeded" : result.status} />
              </div>
              <div>
                <p className="label">Link para enviar</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input className="input font-mono text-xs sm:text-sm flex-1" readOnly value={result.url} />
                  <div className="flex gap-2 shrink-0">
                    <CopyButton value={result.url} label="Copiar link" />
                    <button type="button" className="btn-secondary" onClick={() => shareWhatsApp(result.url, result.amount, result.currency)}>
                      <Share2 className="w-4 h-4" />
                      WhatsApp
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                <div className="flex flex-col items-center justify-center rounded-xl border border-flux-border bg-flux-dark/40 p-4">
                  {result.pix_qr_code_base64 ? (
                    <img
                      src={result.pix_qr_code_base64.startsWith("data:") ? result.pix_qr_code_base64 : `data:image/png;base64,${result.pix_qr_code_base64}`}
                      alt="QR Code PIX"
                      className="w-48 h-48 rounded-lg bg-white p-2"
                    />
                  ) : (
                    <p className="text-sm text-flux-muted py-16">QR indisponivel</p>
                  )}
                  <p className="text-xs text-flux-muted mt-3">Aponte a camera do banco</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="label">PIX copia e cola</p>
                    <textarea className="input font-mono text-xs min-h-[120px] resize-none" readOnly value={result.pix_copy_paste || ""} />
                    {result.pix_copy_paste && (
                      <div className="mt-2">
                        <CopyButton value={result.pix_copy_paste} label="Copiar codigo PIX" />
                      </div>
                    )}
                  </div>
                  {result.expires_at && (
                    <p className="text-xs text-flux-muted">Valido ate {formatDate(result.expires_at)}</p>
                  )}
                  <Link href={`/dashboard/payments/${result.payment_id}`} className="text-sm text-flux-accent hover:underline inline-block">
                    Ver cobranca no painel
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium">Links recentes</h2>
          {historyLoading && <Loader2 className="w-4 h-4 animate-spin text-flux-muted" />}
        </div>
        {history.length === 0 && !historyLoading ? (
          <p className="text-sm text-flux-muted py-4">Nenhum link gerado ainda neste ambiente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-flux-muted border-b border-flux-border">
                  <th className="py-2 pr-3 font-medium">Criado</th>
                  <th className="py-2 pr-3 font-medium">Descricao</th>
                  <th className="py-2 pr-3 font-medium">Valor</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium">Link</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-b border-flux-border/60 last:border-0">
                    <td className="py-3 pr-3 text-flux-muted whitespace-nowrap">{formatDate(row.created_at)}</td>
                    <td className="py-3 pr-3 max-w-[180px] truncate">{row.description}</td>
                    <td className="py-3 pr-3 whitespace-nowrap">{formatCurrency(row.amount, row.currency)}</td>
                    <td className="py-3 pr-3">
                      <StatusBadge
                        status={
                          row.payment_status === "succeeded" || row.status === "complete"
                            ? "succeeded"
                            : row.status === "expired"
                              ? "expired"
                              : "pending"
                        }
                      />
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <CopyButton value={row.url} label="Copiar" />
                        <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-xs text-flux-accent hover:underline">Abrir</a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
