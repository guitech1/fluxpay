import type { PaymentStatus, PixDetails } from "../types/index.js";
import type { AcquirerAdapter, AcquirerHealthStatus } from "./types.js";
const base = () => process.env.KAVROPAY_BASE_URL || "https://api.kavropay.online/v1";
const key = () => { const k = process.env.KAVROPAY_API_KEY; if (!k) throw new Error("KavroPay: sem chave"); return k; };
function mapStatus(s: string): PaymentStatus {
  if (s === "paid") return "succeeded";
  if (s === "expired") return "expired";
  if (s === "cancelled" || s === "canceled") return "failed";
  return "pending";
}
export const kavropayProvider: AcquirerAdapter = {
  id: "kavropay", name: "kavropay",
  isConfigured: () => Boolean(process.env.KAVROPAY_API_KEY),
  getLimits: () => ({ minAmountCents: 100, maxAmountCents: 0 }),
  getConfiguredCost: () => ({ percent: 2.99, fixedCents: 50 }),
  async healthCheck() {
    const t0 = Date.now();
    if (!this.isConfigured()) return { status: "unconfigured" as AcquirerHealthStatus, latencyMs: 0 };
    try {
      const res = await fetch(`${base()}/balance`, { headers: { Authorization: `Bearer ${key()}` }, signal: AbortSignal.timeout(8000) });
      return { status: (res.status >= 500 ? "degraded" : res.status === 401 ? "down" : "healthy") as AcquirerHealthStatus, latencyMs: Date.now() - t0 };
    } catch (e) {
      return { status: "down" as AcquirerHealthStatus, message: e instanceof Error ? e.message : "rede", latencyMs: Date.now() - t0 };
    }
  },
  async createPayment(params) {
    if (params.currency !== "BRL" || params.amount < 100) throw new Error("inválido");
    const body: Record<string, unknown> = { amount: (params.amount / 100).toFixed(2), expiresInMinutes: 30 };
    if (params.description) body.description = params.description;
    if (params.externalId) body.externalId = params.externalId;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 25000);
    let res: Response;
    try {
      res = await fetch(`${base()}/charges`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...(params.externalId ? { "Idempotency-Key": params.externalId } : {}) },
        body: JSON.stringify(body), signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(to);
      const amb = err instanceof Error && err.name === "AbortError";
      const e = new Error(amb ? "timeout" : "rede") as Error & { retryable?: boolean; ambiguous?: boolean };
      e.retryable = true; e.ambiguous = amb; throw e;
    } finally { clearTimeout(to); }
    const data = (await res.json().catch(() => null)) as any;
    if (!res.ok || !data?.id) {
      const e = new Error(`HTTP ${res.status}`) as Error & { retryable?: boolean };
      e.retryable = res.status === 429 || res.status >= 500; throw e;
    }
    const fee = Math.round((data.fee ?? 0) * 100);
    const net = data.net != null ? Math.round(data.net * 100) : params.amount - fee;
    return { providerPaymentId: data.id, status: mapStatus(data.status ?? "waiting_payment"), rawResponse: data,
      pix: { txid: data.id, copyPaste: data.pix_copy_paste ?? "", qrCodeBase64: data.qr_code_base64 ?? "", expiresAt: data.expires_at ?? "", feeAmountCents: fee, netAmountCents: net } satisfies PixDetails };
  },
  async getPayment(ref: string) {
    const res = await fetch(`${base()}/charges/${encodeURIComponent(ref)}`, { headers: { Authorization: `Bearer ${key()}` }, signal: AbortSignal.timeout(15000) });
    const data = (await res.json().catch(() => null)) as any;
    if (!res.ok || !data) throw new Error(`HTTP ${res.status}`);
    const fee = Math.round((data.fee ?? 0) * 100);
    return { status: mapStatus(data.status ?? "waiting_payment"), providerPaymentId: data.id, rawResponse: data,
      pix: { txid: data.id ?? ref, copyPaste: data.pix_copy_paste ?? "", qrCodeBase64: data.qr_code_base64 ?? "", expiresAt: data.expires_at ?? "", feeAmountCents: fee, netAmountCents: data.net != null ? Math.round(data.net * 100) : 0 } };
  },
  async refundPayment() { throw new Error("não suportado"); },
};
