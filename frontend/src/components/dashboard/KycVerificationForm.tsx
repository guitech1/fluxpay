"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { dashboardFetch } from "@/lib/dashboard-api";

type KycStatus = "none" | "pending" | "verified" | "rejected";
type DocumentType = "CPF" | "CNPJ";

interface KycData {
  required: boolean;
  status: KycStatus;
  verified_at: string | null;
  document_type: DocumentType | null;
  document_masked: string | null;
  rejection_reason: string | null;
  verification: {
    id: string;
    document_type: DocumentType;
    document_masked: string;
    status: "pending" | "approved" | "rejected" | "expired";
    qr_code: string | null;
    qr_code_image: string | null;
    amount_cents: number;
    expires_at: string | null;
    payer_name: string | null;
    rejection_reason: string | null;
    verified_at: string | null;
    approved_via: "nexuspag" | "admin" | null;
    created_at: string;
  } | null;
}

function maskInput(value: string, type: DocumentType) {
  const digits = value.replace(/\D/g, "");
  return type === "CPF"
    ? digits.slice(0, 11)
    : digits.slice(0, 14);
}

export function KycVerificationForm({
  initialStatus,
  initialDocumentType,
  initialDocumentMasked,
}: {
  initialStatus: KycStatus;
  initialDocumentType: DocumentType | null;
  initialDocumentMasked: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<KycData | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>(initialDocumentType || "CPF");
  const [document, setDocument] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadStatus() {
    try {
      const result = await dashboardFetch<{ data: KycData }>("/kyc/status");
      setStatus(result.data);
      if (!result.data.required || result.data.status === "verified") {
        router.replace("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel consultar a verificacao.");
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (!status?.verification || status.status !== "pending") return;
    const timer = window.setInterval(loadStatus, 5000);
    return () => window.clearInterval(timer);
  }, [status?.verification?.id, status?.status]);

  async function start(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCopied(false);
    setLoading(true);
    try {
      await dashboardFetch("/kyc/start", {
        method: "POST",
        body: { document, document_type: documentType },
      });
      setDocument("");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel iniciar a verificacao.");
    } finally {
      setLoading(false);
    }
  }

  const verification = status?.verification;
  const effectiveStatus = status?.status || initialStatus;

  async function copyPix() {
    if (!verification?.qr_code) return;
    await navigator.clipboard.writeText(verification.qr_code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (effectiveStatus === "verified") return null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-flux-red">FluxPay · segurança</p>
        <h1 className="text-3xl font-semibold mt-2">Verificar identidade</h1>
        <p className="text-flux-muted mt-2">
          Esta organização exige uma verificação de identidade antes de acessar o painel.
          O FluxPay não exibe o CPF/CNPJ completo depois que ele é enviado.
        </p>
      </div>

      {effectiveStatus === "rejected" && (
        <div className="card border-red-500/30 bg-red-500/5">
          <p className="font-medium">Verificação rejeitada</p>
          <p className="text-sm text-flux-muted mt-1">
            {status?.rejection_reason || verification?.rejection_reason || "Tente novamente com o documento correto."}
          </p>
        </div>
      )}

      {!verification || effectiveStatus === "rejected" || verification.status === "expired" ? (
        <form onSubmit={start} className="card space-y-4">
          <div>
            <h2 className="font-medium">Iniciar verificação</h2>
            <p className="text-sm text-flux-muted mt-1">
              Você pagará um PIX de R$ 2,00 usando o mesmo CPF/CNPJ informado.
            </p>
          </div>

          <label className="block text-sm">
            <span className="text-flux-muted">Documento</span>
            <select
              className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-3"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as DocumentType)}
              disabled={loading}
            >
              <option value="CPF">CPF</option>
              <option value="CNPJ">CNPJ</option>
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-flux-muted">{documentType}</span>
            <input
              required
              inputMode="numeric"
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-3"
              value={document}
              onChange={(e) => setDocument(maskInput(e.target.value, documentType))}
              placeholder={documentType === "CPF" ? "Digite seu CPF" : "Digite seu CNPJ"}
              disabled={loading}
            />
          </label>

          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}

          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Gerando PIX…" : "Gerar PIX de R$ 2,00"}
          </button>
        </form>
      ) : (
        <div className="card space-y-5">
          <div>
            <h2 className="font-medium">Pagamento de verificação</h2>
            <p className="text-sm text-flux-muted mt-1">
              Documento: {verification.document_masked || initialDocumentMasked || "—"} · status: {verification.status}
            </p>
          </div>

          {verification.qr_code_image && (
            <div className="flex justify-center">
              <img
                src={verification.qr_code_image}
                alt="QR Code PIX para verificação"
                className="w-56 h-56 rounded-lg bg-white p-2"
              />
            </div>
          )}

          {verification.qr_code && (
            <div className="space-y-2">
              <p className="text-sm text-flux-muted">PIX copia-e-cola</p>
              <div className="rounded-lg border border-flux-border bg-flux-black p-3 text-xs font-mono break-all">
                {verification.qr_code}
              </div>
              <button type="button" className="btn-secondary w-full" onClick={copyPix}>
                {copied ? "Copiado" : "Copiar PIX copia-e-cola"}
              </button>
            </div>
          )}

          <div className="text-sm text-flux-muted">
            {verification.status === "pending"
              ? "Aguardando o pagamento. Esta tela atualiza automaticamente."
              : verification.status === "approved"
                ? "Identidade aprovada. Redirecionando…"
                : "A verificação precisa ser refeita."}
          </div>

          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        </div>
      )}
    </div>
  );
}
