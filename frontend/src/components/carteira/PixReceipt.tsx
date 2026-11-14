"use client";

import { useRef } from "react";
import { Download, Share2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

export type PixReceiptData = {
  id: string;
  status: string;
  net: number;
  fee: number;
  amount: number;
  currency: string;
  created_at: string;
  updated_at?: string | null;
  pix_key_type: string;
  pix_key_masked?: string | null;
  provider_reference?: string | null;
  /** End-to-end ID when provided by provider */
  e2e_id?: string | null;
  /** Payer (wallet holder) */
  payer_name?: string | null;
  payer_document_masked?: string | null;
  /** Receiver — only data that came from provider or EMV, never invented */
  receiver_name?: string | null;
  receiver_document_masked?: string | null;
  receiver_institution?: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  cpf: "Chave Pix (CPF)",
  cnpj: "Chave Pix (CNPJ)",
  email: "Chave Pix (E-mail)",
  phone: "Chave Pix (Telefone)",
  random: "Chave Pix (Aleatória)",
  qrc: "QR Code / Copia e cola",
};

function statusLabel(status: string): { text: string; tone: "ok" | "warn" | "bad" | "neutral" } {
  switch (status) {
    case "completed":
      return { text: "Pix realizado", tone: "ok" };
    case "processing":
    case "approved":
      return { text: "Em processamento", tone: "warn" };
    case "pending":
      return { text: "Pendente", tone: "warn" };
    case "failed":
    case "rejected":
      return { text: status === "rejected" ? "Recusado" : "Falhou", tone: "bad" };
    default:
      return { text: status, tone: "neutral" };
  }
}

interface Props {
  data: PixReceiptData;
  onClose?: () => void;
}

export function PixReceipt({ data, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const st = statusLabel(data.status);
  const isCompleted = data.status === "completed";

  async function handleDownload() {
    if (!ref.current) return;
    try {
      // Prefer html2canvas if present; otherwise print-friendly fallback
      const html2canvas = (window as any).html2canvas;
      if (typeof html2canvas === "function") {
        const canvas = await html2canvas(ref.current, { scale: 2, backgroundColor: "#0b0f14" });
        const link = document.createElement("a");
        link.download = `fluxpay-comprovante-pix-${data.id.slice(0, 8)}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        return;
      }
      // Fallback: open print dialog focused on receipt
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.write(`
        <html><head><title>Comprovante FluxPay</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #0b0f14; color: #e8eef7; padding: 24px; }
          .card { max-width: 420px; margin: 0 auto; border: 1px solid #1e2a3a; border-radius: 16px; padding: 24px; }
          h1 { font-size: 18px; margin: 0 0 4px; letter-spacing: 0.04em; }
          .sub { color: #8b9bb4; font-size: 13px; margin-bottom: 20px; }
          .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #1a2433; font-size: 14px; }
          .label { color: #8b9bb4; }
          .value { font-weight: 600; text-align: right; }
          .status-ok { color: #3dd68c; }
          .status-warn { color: #f5a524; }
          .status-bad { color: #f31260; }
          .brand { font-weight: 700; color: #5b8def; margin-bottom: 16px; }
        </style></head><body>
        <div class="card">${ref.current.innerHTML}</div>
        <script>window.onload=()=>{window.print();}</script>
        </body></html>`);
      w.document.close();
    } catch {
      /* silent */
    }
  }

  async function handleShare() {
    const text = [
      "FLUXPAY — COMPROVANTE PIX",
      `Status: ${st.text}`,
      `Valor: ${formatCurrency(data.net, data.currency)}`,
      `Data: ${formatDate(data.created_at)}`,
      data.payer_name ? `De: ${data.payer_name}` : null,
      data.receiver_name ? `Para: ${data.receiver_name}` : null,
      `ID: ${data.id}`,
      data.provider_reference ? `Ref. provedor: ${data.provider_reference}` : null,
      data.e2e_id ? `E2E: ${data.e2e_id}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    if (navigator.share) {
      try {
        await navigator.share({ title: "Comprovante Pix FluxPay", text });
        return;
      } catch {
        /* user cancelled or not supported */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      alert("Comprovante copiado para a área de transferência.");
    } catch {
      alert("Não foi possível compartilhar automaticamente.");
    }
  }

  return (
    <div className="fxb-panel fxb-rise" style={{ maxWidth: 440, margin: "0 auto" }}>
      <div ref={ref} style={{ padding: "4px 0" }}>
        <div className="brand" style={{ fontWeight: 700, color: "#5b8def", letterSpacing: "0.06em", fontSize: 13 }}>
          FLUXPAY
        </div>
        <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>COMPROVANTE PIX</h2>
        <p className="fxb-row-sub" style={{ marginBottom: 16 }}>
          Documento gerado pela FluxPay · {formatDate(data.created_at)}
        </p>

        <div
          style={{
            display: "inline-flex",
            padding: "4px 12px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 16,
            background:
              st.tone === "ok"
                ? "rgba(61,214,140,0.12)"
                : st.tone === "warn"
                  ? "rgba(245,165,36,0.12)"
                  : st.tone === "bad"
                    ? "rgba(243,18,96,0.12)"
                    : "rgba(255,255,255,0.06)",
            color:
              st.tone === "ok"
                ? "#3dd68c"
                : st.tone === "warn"
                  ? "#f5a524"
                  : st.tone === "bad"
                    ? "#f31260"
                    : "#8b9bb4",
          }}
        >
          {st.text}
        </div>

        {!isCompleted && (
          <p className="fxb-row-sub" style={{ marginBottom: 12 }}>
            Este comprovante só recebe o status “Pix realizado” após confirmação efetiva do provedor.
          </p>
        )}

        <dl className="fxb-sum" style={{ marginBottom: 8 }}>
          <div>
            <dt>Valor</dt>
            <dd style={{ fontSize: 20 }}>{formatCurrency(data.net, data.currency)}</dd>
          </div>
          <div>
            <dt>Taxa</dt>
            <dd>{formatCurrency(data.fee || 0, data.currency)}</dd>
          </div>
          <div>
            <dt>Total debitado</dt>
            <dd>{formatCurrency(data.amount || data.net + (data.fee || 0), data.currency)}</dd>
          </div>
          <div>
            <dt>Data / horário</dt>
            <dd>{formatDate(data.created_at)}</dd>
          </div>
          <div>
            <dt>Tipo</dt>
            <dd>{TYPE_LABEL[data.pix_key_type] || data.pix_key_type}</dd>
          </div>
        </dl>

        <div style={{ marginTop: 16, marginBottom: 8 }}>
          <p className="fxb-label" style={{ marginBottom: 6 }}>
            De (pagador)
          </p>
          <p style={{ fontWeight: 600 }}>{data.payer_name || "Titular da carteira"}</p>
          {data.payer_document_masked && (
            <p className="fxb-row-sub">CPF {data.payer_document_masked}</p>
          )}
        </div>

        <div style={{ marginTop: 12, marginBottom: 8 }}>
          <p className="fxb-label" style={{ marginBottom: 6 }}>
            Para (recebedor)
          </p>
          {data.receiver_name ? (
            <p style={{ fontWeight: 600 }}>{data.receiver_name}</p>
          ) : (
            <p className="fxb-row-sub">Dados do recebedor não retornados pelo provedor</p>
          )}
          {data.receiver_document_masked && (
            <p className="fxb-row-sub">Documento {data.receiver_document_masked}</p>
          )}
          {data.receiver_institution && (
            <p className="fxb-row-sub">Instituição {data.receiver_institution}</p>
          )}
          {data.pix_key_masked && (
            <p className="fxb-row-sub">Chave {data.pix_key_masked}</p>
          )}
        </div>

        <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
          <p className="fxb-label" style={{ marginBottom: 8 }}>
            Dados da transação
          </p>
          <p className="fxb-row-sub" style={{ wordBreak: "break-all" }}>
            ID FluxPay: {data.id}
          </p>
          {data.e2e_id && (
            <p className="fxb-row-sub" style={{ wordBreak: "break-all" }}>
              End-to-end (E2E): {data.e2e_id}
            </p>
          )}
          {data.provider_reference && (
            <p className="fxb-row-sub" style={{ wordBreak: "break-all" }}>
              Ref. NexusPag: {data.provider_reference}
            </p>
          )}
        </div>
      </div>

      <div className="fxb-btn-row" style={{ marginTop: 20 }}>
        <button type="button" className="btn btn-secondary" onClick={handleDownload}>
          <Download size={16} style={{ marginRight: 6 }} />
          Baixar
        </button>
        <button type="button" className="btn btn-primary" onClick={handleShare}>
          <Share2 size={16} style={{ marginRight: 6 }} />
          Compartilhar
        </button>
      </div>
      {onClose && (
        <button
          type="button"
          className="btn btn-secondary w-full"
          style={{ marginTop: 8 }}
          onClick={onClose}
        >
          Fechar
        </button>
      )}
    </div>
  );
}
