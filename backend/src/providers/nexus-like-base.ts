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
        return { status: res.status >= 500 ? "degraded" as AcquirerHealthStatus : "healthy" as AcquirerHealthStatus, latencyMs: ms };
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
      if (params.webhookUrl) body.webhook_url = params.webhookUrl;
      if (params.expirationSeconds) body.expiration = params.expirationSeconds;
      const attemptTimeoutMs = Math.max(
        500,
        Number(process.env.FLUXPAY_ACQUIRER_ATTEMPT_TIMEOUT_MS || 2000) || 2000
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
      const tx = data.transaction;
      return {
        providerPaymentId: tx.id, status: mapStatus(tx.status), rawResponse: data,
        pix: { txid: tx.txid, copyPaste: tx.pix_copia_cola, qrCodeBase64: tx.qr_code_base64, expiresAt: tx.expires_at, feeAmountCents: reaisToCents(tx.fee), netAmountCents: reaisToCents(tx.net_amount) } satisfies PixDetails,
      };
    },
    async getPayment(ref: string) {
      const res = await fetch(`${base()}/api/pix/${encodeURIComponent(ref)}`, { headers: { "x-api-key": getKey() }, signal: AbortSignal.timeout(15000) });
      if (res.status === 404) throw new Error("não encontrado");
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok || !data) throw new Error(`HTTP ${res.status}`);
      return {
        status: mapStatus(data.status ?? "pending"), providerPaymentId: data.id, rawResponse: data,
        pix: data.txid ? { txid: data.txid, copyPaste: data.pix_copia_cola ?? "", qrCodeBase64: data.qr_code_base64 ?? "", expiresAt: data.expires_at ?? "", feeAmountCents: reaisToCents(data.fee ?? 0), netAmountCents: reaisToCents(data.net_amount ?? 0) } : undefined,
      };
    },
    async refundPayment(_params: { providerPaymentId: string; amount: number; }): Promise<{ providerRefundId: string; status: import("../types/index.js").RefundStatus; rawResponse?: unknown; }> {
      throw new Error("não suportado");
    },
  };
  return adapter;
}
