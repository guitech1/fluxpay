"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { dashboardFetch } from "@/lib/dashboard-api";
import { CopyButton } from "@/components/dashboard/ui-client";

type DocType = "CPF" | "CNPJ";

interface OrgKyc {
  kyc_required?: boolean;
  kyc_status?: string;
  kyc_document_masked?: string | null;
  kyc_rejection_reason?: string | null;
}

interface Verification {
  id: string;
  status: string;
  document_masked?: string;
  qr_code?: string | null;
  qr_code_image?: string | null;
  amount_cents?: number;
  expires_at?: string | null;
  rejection_reason?: string | null;
}

export function KycVerifyClient({ canStart }: { canStart: boolean }) {
  const router = useRouter();
  const [documentType, setDocumentType] = useState<DocType>("CPF");
  const [document, setDocument] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [org, setOrg] = useState<OrgKyc | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await dashboardFetch<{ data: { organization: OrgKyc; verification: Verification | null } }>(
        "/kyc/status"
      );
      setOrg(res.data.organization);
      setVerification(res.data.verification);
      if (res.data.organization?.kyc_status === "verified" || !res.data.organization?.kyc_required) {
        router.replace("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar status KYC.");
    }
  }, [router]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await dashboardFetch<{
        data: { organization: OrgKyc; verification: Verification };
      }>("/kyc/start", {
        method: "POST",
        body: { document, document_type: documentType },
      });
      setOrg(res.data.organization);
      setVerification(res.data.verification);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao iniciar verificação.");
    } finally {
      setLoading(false);
    }
  }

  const pending = verification?.status === "pending";
  const rejected = org?.kyc_status === "rejected" || verification?.status === "rejected";

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Verificação de identidade</h1>
        <p className="text-sm text-flux-muted">
          Sua conta precisa confirmar o CPF ou CNPJ antes de usar o painel. Pague o PIX de R$ 2,00
          com a conta do mesmo documento.
        </p>
      </div>

      {rejected && (
        <div className="card border-red-500/30 bg-red-500/10 text-sm text-red-100">
          Verificação rejeitada
          {(org?.kyc_rejection_reason || verification?.rejection_reason) &&
            `: ${org?.kyc_rejection_reason || verification?.rejection_reason}`}
          . Você pode tentar de novo.
        </div>
      )}

      {pending && verification ? (
        <div className="card space-y-4">
          <p className="text-sm text-flux-muted">
            Documento {verification.document_masked || org?.kyc_document_masked}. Escaneie o QR ou
            copie o código. A página atualiza sozinha após o pagamento.
          </p>
          {verification.qr_code_image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={
                verification.qr_code_image.startsWith("data:")
                  ? verification.qr_code_image
                  : `data:image/png;base64,${verification.qr_code_image}`
              }
              alt="QR Code KYC"
              className="mx-auto w-56 h-56 rounded-lg bg-white p-2"
            />
          )}
          {verification.qr_code && (
            <div className="flex items-center gap-2 rounded-lg border border-flux-border bg-flux-black px-3 py-2">
              <code className="font-mono text-xs break-all min-w-0 flex-1">{verification.qr_code}</code>
              <CopyButton value={verification.qr_code} iconOnly />
            </div>
          )}
          <button type="button" className="btn-secondary w-full" onClick={() => load()}>
            Já paguei — atualizar status
          </button>
        </div>
      ) : (
        canStart && (
          <form onSubmit={start} className="card space-y-4">
            <label className="block text-sm">
              <span className="text-flux-muted">Tipo de documento</span>
              <select
                className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as DocType)}
                disabled={loading}
              >
                <option value="CPF">CPF</option>
                <option value="CNPJ">CNPJ</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-flux-muted">{documentType}</span>
              <input
                className="mt-1 w-full rounded-lg border border-flux-border bg-flux-gray/40 px-3 py-2"
                value={document}
                onChange={(e) => setDocument(e.target.value)}
                placeholder={documentType === "CPF" ? "000.000.000-00" : "00.000.000/0000-00"}
                disabled={loading}
                required
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-300">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "Gerando PIX…" : "Continuar"}
            </button>
          </form>
        )
      )}

      {!canStart && !pending && (
        <p className="text-sm text-flux-muted text-center">
          Peça a um administrador ou ao proprietário da conta para iniciar a verificação.
        </p>
      )}
    </div>
  );
}
