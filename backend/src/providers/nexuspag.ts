import type { PaymentProvider, PaymentStatus, RefundStatus, PixDetails } from "../types/index.js";

const NEXUSPAG_BASE_URL = process.env.NEXUSPAG_BASE_URL || "https://nexuspag.com";

function getApiKey(): string {
  const key = process.env.NEXUSPAG_API_KEY;
  if (!key) {
    throw new Error("NEXUSPAG_API_KEY nao configurada.");
  }
  return key;
}

function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}

function reaisToCents(reais: number): number {
  return Math.round(reais * 100);
}

function mapNexusPagStatus(status: string): PaymentStatus {
  switch (status) {
    case "pending": return "pending";
    case "paid": return "succeeded";
    case "expired": return "expired";
    case "cancelled":
    case "canceled": return "canceled";
    default: return "pending";
  }
}

export class NexusPagProvider implements PaymentProvider {
  name = "nexuspag";
  id = "nexuspag" as const;
  isConfigured() { return Boolean(process.env.NEXUSPAG_API_KEY); }
  getLimits() { return { minAmountCents: 100, maxAmountCents: 0 }; }
  getConfiguredCost() { return { percent: 5, fixedCents: 0 }; }
  async healthCheck() {
    const t0 = Date.now();
    if (!this.isConfigured()) return { status: "unconfigured" as const, latencyMs: 0 };
    try {
      const base = process.env.NEXUSPAG_BASE_URL || "https://nexuspag.com";
      const res = await fetch(`${base}/api/wallet`, { headers: { "x-api-key": process.env.NEXUSPAG_API_KEY as string }, signal: AbortSignal.timeout(8000) });
      const ms = Date.now() - t0;
      if (res.status === 401 || res.status === 403) return { status: "down" as const, message: "auth", latencyMs: ms };
      return { status: res.status >= 500 ? "degraded" as const : "healthy" as const, latencyMs: ms };
    } catch (e) {
      return { status: "down" as const, message: e instanceof Error ? e.message : "rede", latencyMs: Date.now() - t0 };
    }
  }

  async createPayment(params: {
    amount: number;
    currency: string;
    paymentMethodToken?: string;
    metadata?: Record<string, unknown>;
    description?: string;
    externalId?: string;
    webhookUrl?: string;
    expirationSeconds?: number;
  }) {
    if (params.currency !== "BRL") throw new Error("NexusPag: apenas BRL");
    if (params.amount < 100) throw new Error("NexusPag: minimo R$ 1,00");
    const body: Record<string, unknown> = { amount: centsToReais(params.amount) };
    if (params.description) body.description = params.description;
    if (params.externalId) body.external_id = params.externalId;
    if (params.webhookUrl) body.webhook_url = params.webhookUrl;
    if (params.expirationSeconds) body.expiration = params.expirationSeconds;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 25000);
    let res: Response;
    try {
      res = await fetch(`${NEXUSPAG_BASE_URL}/api/pix/create`, {
        method: "POST",
        headers: { "x-api-key": getApiKey(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(to);
      const amb = err instanceof Error && err.name === "AbortError";
      const e = new Error(amb ? "NexusPag: timeout" : "NexusPag: rede") as Error & { retryable?: boolean; ambiguous?: boolean };
      e.retryable = true; e.ambiguous = amb; throw e;
    } finally { clearTimeout(to); }
    const data = (await res.json().catch(() => null)) as {
      success?: boolean;
      transaction?: {
        id: string; txid: string; status: string; fee: number; net_amount: number;
        pix_copia_cola: string; qr_code_base64: string; expires_at: string;
      };
    } | null;
    if (!res.ok || !data?.success || !data.transaction) {
      const e = new Error(`NexusPag HTTP ${res.status}`) as Error & { retryable?: boolean; ambiguous?: boolean };
      e.retryable = res.status === 429 || res.status >= 500; e.ambiguous = false; throw e;
    }
    const tx = data.transaction;
    return {
      providerPaymentId: tx.id,
      status: mapNexusPagStatus(tx.status),
      rawResponse: data,
      pix: {
        txid: tx.txid,
        copyPaste: tx.pix_copia_cola,
        qrCodeBase64: tx.qr_code_base64,
        expiresAt: tx.expires_at,
        feeAmountCents: reaisToCents(tx.fee),
        netAmountCents: reaisToCents(tx.net_amount),
      } satisfies PixDetails,
    };
  }

  async getPayment(ref: string) {
    const res = await fetch(`${NEXUSPAG_BASE_URL}/api/pix/${encodeURIComponent(ref)}`, {
      headers: { "x-api-key": getApiKey() },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) throw new Error("nao encontrado");
    const data = (await res.json().catch(() => null)) as {
      id?: string; txid?: string; status?: string; fee?: number; net_amount?: number;
      pix_copia_cola?: string; qr_code_base64?: string; expires_at?: string;
    } | null;
    if (!res.ok || !data) throw new Error(`consulta HTTP ${res.status}`);
    return {
      status: mapNexusPagStatus(data.status ?? "pending"),
      providerPaymentId: data.id,
      rawResponse: data,
      pix: data.txid ? {
        txid: data.txid,
        copyPaste: data.pix_copia_cola ?? "",
        qrCodeBase64: data.qr_code_base64 ?? "",
        expiresAt: data.expires_at ?? "",
        feeAmountCents: reaisToCents(data.fee ?? 0),
        netAmountCents: reaisToCents(data.net_amount ?? 0),
      } : undefined,
    };
  }

  async refundPayment(_params: {
    providerPaymentId: string;
    amount: number;
  }): Promise<{
    providerRefundId: string;
    status: import("../types/index.js").RefundStatus;
    rawResponse?: unknown;
  }> {
    throw new Error("Reembolso PIX nao suportado via API NexusPag");
  }
}

export const nexuspagProvider = new NexusPagProvider();

export async function createNexusPagWithdrawal(params: {
  amountCents: number;
  pixKey: string;
  pixKeyType: string;
  description?: string;
  externalId?: string;
}): Promise<{ id: string; status: string; rawResponse: unknown }> {
  const body: Record<string, unknown> = {
    amount: centsToReais(params.amountCents),
    pix_key: params.pixKey,
    pix_key_type: params.pixKeyType,
  };
  if (params.description) body.description = params.description;
  if (params.externalId) body.external_id = params.externalId;
  const res = await fetch(`${NEXUSPAG_BASE_URL}/api/withdrawals`, {
    method: "POST",
    headers: { "x-api-key": getApiKey(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as any;
  if (!res.ok || !data) {
    throw new Error(`NexusPag saque HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return { id: data.id || data.withdrawal?.id || "", status: data.status || data.withdrawal?.status || "pending", rawResponse: data };
}

interface NexusPagKycResult {
  id: string;
  externalId: string | null;
  status: "pending" | "approved" | "rejected" | "expired" | string;
  documentType: string;
  documentNumberMasked: string;
  amountCents: number;
  qrCode: string;
  qrCodeImage: string;
  expiresAt: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  payerName: string | null;
  rawResponse?: unknown;
}

interface NexusPagKycResponse {
  success?: boolean;
  verification?: {
    id: string;
    external_id?: string | null;
    status: string;
    document_type?: string;
    document_number?: string;
    amount?: number;
    qr_code?: string;
    qr_code_image?: string;
    expires_at?: string | null;
    verified_at?: string | null;
    paid_at?: string | null;
    rejection_reason?: string | null;
    payer_name?: string | null;
  };
}

function mapKyc(data: NonNullable<NexusPagKycResponse["verification"]>): NexusPagKycResult {
  return {
    id: data.id,
    externalId: data.external_id ?? null,
    status: data.status,
    documentType: data.document_type || "",
    documentNumberMasked: data.document_number || "",
    amountCents: reaisToCents(data.amount ?? 2),
    qrCode: data.qr_code || "",
    qrCodeImage: data.qr_code_image || "",
    expiresAt: data.expires_at ?? null,
    verifiedAt: data.verified_at ?? data.paid_at ?? null,
    rejectionReason: data.rejection_reason ?? null,
    payerName: data.payer_name ?? null,
  };
}

export async function createNexusPagKycVerification(params: {
  document: string;
  documentType: "CPF" | "CNPJ";
  externalId?: string;
  webhookUrl?: string;
}): Promise<NexusPagKycResult> {
  const body: Record<string, unknown> = {
    document: params.document,
    document_type: params.documentType,
  };
  if (params.externalId) body.external_id = params.externalId;
  if (params.webhookUrl) body.webhook_url = params.webhookUrl;

  const response = await fetch(`${NEXUSPAG_BASE_URL}/api/kyc/verify`, {
    method: "POST",
    headers: {
      "x-api-key": getApiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => null)) as NexusPagKycResponse | null;

  if (!response.ok || !data?.success || !data.verification) {
    throw new Error(
      `NexusPag recusou KYC (HTTP ${response.status}): ${JSON.stringify(data)}`
    );
  }

  return { ...mapKyc(data.verification), rawResponse: data };
}

export async function getNexusPagKycVerification(id: string): Promise<NexusPagKycResult> {
  const response = await fetch(
    `${NEXUSPAG_BASE_URL}/api/kyc/verify/${encodeURIComponent(id)}`,
    { headers: { "x-api-key": getApiKey() } }
  );

  const data = (await response.json().catch(() => null)) as NexusPagKycResponse | null;

  if (!response.ok || !data?.success || !data.verification) {
    throw new Error(
      `Falha ao consultar KYC na NexusPag (HTTP ${response.status}): ${JSON.stringify(data)}`
    );
  }

  return { ...mapKyc(data.verification), rawResponse: data };
}
