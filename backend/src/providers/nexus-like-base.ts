import type { PaymentStatus, PixDetails } from "../types/index.js";
import type { AcquirerAdapter, AcquirerHealthStatus, AcquirerId } from "./types.js";
export const centsToReais = (c: number) => Math.round(c) / 100;
export const reaisToCents = (r: number) => Math.round(r * 100);
function mapStatus(s: string): PaymentStatus {
  if (s === "paid") return "succeeded";
  if (s === "expired") return "expired";
  if (s === "cancelled" || s === "canceled") return "failed";
  return "pending";
}

/** Extrai pagador de payloads Nexus-like (create, GET /api/pix/:id, webhook). */
export function extractPayerFromNexusPayload(data: unknown): {
  payerName: string | null;
  payerDocument: string | null;
} {
  if (!data || typeof data !== "object") return { payerName: null, payerDocument: null };
  const root = data as Record<string, unknown>;
  const tx =
    root.transaction && typeof root.transaction === "object"
      ? (root.transaction as Record<string, unknown>)
      : null;
  const payerObj =
    (root.payer && typeof root.payer === "object" ? (root.payer as Record<string, unknown>) : null) ||
    (tx?.payer && typeof tx.payer === "object" ? (tx.payer as Record<string, unknown>) : null);
  const nameRaw =
    (typeof root.payer_name === "string" && root.payer_name) ||
    (typeof root.payerName === "string" && root.payerName) ||
    (typeof tx?.payer_name === "string" && tx.payer_name) ||
    (typeof payerObj?.name === "string" && payerObj.name) ||
    null;
  const docRaw =
    (typeof root.payer_document === "string" && root.payer_document) ||
    (typeof root.payer_document_masked === "string" && root.payer_document_masked) ||
    (typeof tx?.payer_document === "string" && tx.payer_document) ||
    (typeof tx?.payer_document_masked === "string" && tx.payer_document_masked) ||
    (typeof payerObj?.document === "string" && payerObj.document) ||
    null;
  const payerName = nameRaw ? String(nameRaw).trim() || null : null;
  const payerDocument = docRaw ? String(docRaw).trim() || null : null;
  return { payerName, payerDocument };
}

function pixFromNexusBody(data: Record<string, unknown>, tx?: Record<string, unknown> | null): PixDetails | undefined {
  const src = tx || data;
  const txid = (typeof src.txid === "string" && src.txid) || (typeof data.txid === "string" && data.txid) || "";
  if (!txid && !src.pix_copia_cola && !data.pix_copia_cola) return undefined;
  const { payerName, payerDocument } = extractPayerFromNexusPayload(tx ? { ...data, transaction: tx } : data);
  return {
    txid: txid || String(src.id || data.id || ""),
    copyPaste: String(src.pix_copia_cola ?? data.pix_copia_cola ?? ""),
    qrCodeBase64: String(src.qr_code_base64 ?? data.qr_code_base64 ?? ""),
    expiresAt: String(src.expires_at ?? data.expires_at ?? ""),
    feeAmountCents: reaisToCents(Number(src.fee ?? data.fee ?? 0)),
    netAmountCents: reaisToCents(Number(src.net_amount ?? data.net_amount ?? 0)),
    payerName,
    payerDocument,
  };
}

export interface NexusLikeOptions {
  id: AcquirerId; displayName: string; baseUrlEnv: string; defaultBaseUrl: string;
  apiKeyEnv: string; defaultCostPercent: number; minAmountCents?: number;
}
export function createNexusLikeProvider(opts: NexusLikeOptions): AcquirerAdapter {
  const minCents = opts.minAmountCents ?? 100;
  const getKey = () => {
    const k = process.env[opts.apiKeyEnv];
    if (!k) throw new Error(`${opts.displayName}: credencial ausente`);
    return k;
  };
  const base = () => process.env[opts.baseUrlEnv] || opts.defaultBaseUrl;
  const adapter: AcquirerAdapter = {
    id: opts.id, name: opts.id,
    isConfigured: () => Boolean(process.env[opts.apiKeyEnv]),
    getLimits: () => ({ minAmountCents: minCents, maxAmountCents: 0 }),
    getConfiguredCost: () => ({ percent: opts.defaultCostPercent, fixedCents: 0 }),
    async healthCheck() {
      const t0 = Date.now();
      if (!adapter.isConfigured()) return { status: "unconfigured" as AcquirerHealthStatus, latencyMs: 0 };
      try {
        const res = await fetch(`${base()}/api/wallet`, { headers: { "x-api-key": getKey() }, signal: AbortSignal.timeout(8000) });
        const ms = Date.now() - t0;
        if (res.status === 401 || res.status === 403) return { status: "down" as AcquirerHealthStatus, message: "auth", latencyMs: ms };
        return { status: res.status >= 500 ? ("degraded" as const) : ("healthy" as const), latencyMs: ms };
      } catch (e) {
        return { status: "down" as AcquirerHealthStatus, message: e instanceof Error ? e.message : "rede", latencyMs: Date.now() - t0 };
      }
    },
    async createPayment(params) {
      if (params.currency !== "BRL") throw new Error(`${opts.displayName}: apenas BRL`);
      if (params.amount < minCents) throw new Error(`${opts.displayName}: mínimo`);
      const body: Record<string, unknown> = { amount: centsToReais(params.amount) };
      if (params.description) body.description = params.description;
      if (params.externalId) body.external_id = params.externalId;
      if (params.webhookUrl) {
        const callbackUrl = new URL(params.webhookUrl);
        callbackUrl.searchParams.set("provider", String(opts.id));
        body.webhook_url = callbackUrl.toString();
      }
      if (params.expirationSeconds) body.expiration = params.expirationSeconds;

      // Subcontas SmokePay (e shops Nexus-like): shop_id / external_ref
      // Só envia se o provider for o que recebe o shop (tipicamente smokepay).
      // Outros adquirentes ignoram no lado deles; nós só forçamos smokepay no roteador.
      if (params.shopId) {
        body.shop_id = params.shopId;
      }
      if (typeof params.platformFeePercent === "number" && params.platformFeePercent > 0) {
        body.platform_fee_percent = params.platformFeePercent;
      }
      if (params.splits && Array.isArray(params.splits) && params.splits.length > 0) {
        body.splits = params.splits;
      }

      const attemptTimeoutMs = Math.max(
        500,
        Number(process.env.FLUXPAY_ACQUIRER_ATTEMPT_TIMEOUT_MS || 8000) || 8000
      );
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), attemptTimeoutMs);
      let res: Response;
      try {
        res = await fetch(`${base()}/api/pix/create`, {
          method: "POST",
          headers: { "x-api-key": getKey(), "Content-Type": "application/json" },
          body: JSON.stringify(body), signal: ctrl.signal,
        });
      } catch (err) {
        clearTimeout(to);
        const amb = err instanceof Error && err.name === "AbortError";
        const e = new Error(amb ? "timeout" : "rede") as Error & { retryable?: boolean; ambiguous?: boolean };
        e.retryable = true; e.ambiguous = amb; throw e;
      } finally { clearTimeout(to); }
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok || !data?.success || !data.transaction) {
        const e = new Error(`HTTP ${res.status}`) as Error & { retryable?: boolean; ambiguous?: boolean; statusCode?: number };
        e.statusCode = res.status;
        e.retryable = res.status === 429 || res.status >= 500;
        e.ambiguous = false;
        throw e;
      }
      const tx = data.transaction as Record<string, unknown>;
      return {
        providerPaymentId: String(tx.id),
        status: mapStatus(String(tx.status || "pending")),
        rawResponse: data,
        pix: pixFromNexusBody(data, tx),
      };
    },
    async getPayment(ref: string) {
      // Consulta PIX na adquirente: GET /api/pix/:id_ou_txid (docs Nexus-like)
      const res = await fetch(`${base()}/api/pix/${encodeURIComponent(ref)}`, {
        headers: { "x-api-key": getKey() },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 404) throw new Error("não encontrado");
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok || !data) throw new Error(`HTTP ${res.status}`);
      const tx =
        data.transaction && typeof data.transaction === "object"
          ? (data.transaction as Record<string, unknown>)
          : null;
      const statusRaw = String(tx?.status ?? data.status ?? "pending");
      const providerPaymentId = String(tx?.id ?? data.id ?? ref);
      return {
        status: mapStatus(statusRaw),
        providerPaymentId,
        rawResponse: data,
        pix: pixFromNexusBody(data as Record<string, unknown>, tx),
      };
    },
    async refundPayment(_params: { providerPaymentId: string; amount: number; }): Promise<{ providerRefundId: string; status: import("../types/index.js").RefundStatus; rawResponse?: unknown; }> {
      throw new Error("não suportado");
    },
  };
  return adapter;
}
