import type { PaymentProvider, Environment } from "../types/index.js";
import { AppError } from "../middleware/error.js";
import { sandboxProvider } from "./sandbox.js";
import { nexuspagProvider } from "./nexuspag.js";
import { gothampayProvider } from "./gothampay.js";
import { smokepayProvider } from "./smokepay.js";
import { kavropayProvider } from "./kavropay.js";
import type { AcquirerAdapter, AcquirerId, AcquirerConfig, ChargeAttemptResult, CreateChargeContext } from "./types.js";

const adapters: Record<string, AcquirerAdapter | PaymentProvider> = {
  sandbox: sandboxProvider as unknown as AcquirerAdapter,
  nexuspag: nexuspagProvider as unknown as AcquirerAdapter,
  gothampay: gothampayProvider, smokepay: smokepayProvider, kavropay: kavropayProvider,
};
const PRIORITY: Record<AcquirerId, number> = { sandbox: 999, nexuspag: 10, gothampay: 20, smokepay: 30, kavropay: 40 };
const MAX = 3;
function asA(p: PaymentProvider | AcquirerAdapter): AcquirerAdapter | null {
  return "id" in p && typeof (p as AcquirerAdapter).isConfigured === "function" ? (p as AcquirerAdapter) : null;
}
export function isLiveEnabled(): boolean {
  return Boolean(process.env.NEXUSPAG_API_KEY || process.env.GOTHAMPAY_API_KEY || process.env.SMOKEPAY_API_KEY || process.env.KAVROPAY_API_KEY);
}
function activeIds(): AcquirerId[] {
  const raw = process.env.FLUXPAY_ACTIVE_ACQUIRERS?.trim();
  if (raw) return raw.split(",").map((s) => s.trim().toLowerCase()).filter((id): id is AcquirerId => id in adapters && id !== "sandbox").slice(0, MAX);
  return (["nexuspag", "gothampay", "smokepay", "kavropay"] as AcquirerId[]).filter((id) => asA(adapters[id])?.isConfigured()).sort((a, b) => PRIORITY[a] - PRIORITY[b]).slice(0, MAX);
}
export function getProvider(environment: Environment, preferred?: string): PaymentProvider {
  if (environment === "test") return sandboxProvider;
  if (!isLiveEnabled()) throw new AppError(503, "provider_unavailable", "Pagamentos em produção ainda não estão disponíveis nesta conta.");
  if (preferred && preferred !== "sandbox" && adapters[preferred]) return adapters[preferred] as PaymentProvider;
  for (const id of activeIds()) { if (asA(adapters[id])?.isConfigured()) return adapters[id] as PaymentProvider; }
  if (process.env.NEXUSPAG_API_KEY) return nexuspagProvider;
  throw new AppError(503, "provider_unavailable", "Nenhum adquirente válido configurado.");
}
export function listProviders() { return Object.keys(adapters); }
export function getAdapter(id: string) { return adapters[id] ? asA(adapters[id]) : null; }
export function listAcquirerConfigs(): AcquirerConfig[] {
  const active = new Set(activeIds());
  const names: Record<AcquirerId, string> = { nexuspag: "NexusPag", gothampay: "GothamPay", smokepay: "SmokePay", kavropay: "KavroPay", sandbox: "Sandbox" };
  return (["nexuspag", "gothampay", "smokepay", "kavropay", "sandbox"] as AcquirerId[]).map((id) => {
    const a = asA(adapters[id]);
    const configured = a?.isConfigured() ?? id === "sandbox";
    const limits = a?.getLimits() ?? { minAmountCents: 100, maxAmountCents: 0 };
    const cost = a?.getConfiguredCost() ?? { percent: 0, fixedCents: 0 };
    return { id, displayName: names[id], enabled: id === "sandbox" ? true : active.has(id) && configured, priority: PRIORITY[id], environment: id === "sandbox" ? "test" as const : "live" as const, costPercent: cost.percent, costFixedCents: cost.fixedCents, minAmountCents: limits.minAmountCents, maxAmountCents: limits.maxAmountCents, configured, healthStatus: configured ? "unknown" as const : "unconfigured" as const };
  });
}
export function selectProviderForCharge(ctx: CreateChargeContext, environment: Environment) {
  if (environment === "test") return sandboxProvider;
  const eligible = activeIds().filter((id) => !ctx.attemptedProviders.includes(id)).map((id) => ({ id, a: asA(adapters[id]) })).filter((x): x is { id: AcquirerId; a: AcquirerAdapter } => {
    if (!x.a?.isConfigured()) return false;
    const l = x.a.getLimits();
    if (ctx.amountCents < l.minAmountCents) return false;
    if (l.maxAmountCents > 0 && ctx.amountCents > l.maxAmountCents) return false;
    return true;
  }).sort((a, b) => PRIORITY[a.id] - PRIORITY[b.id]);
  if (!eligible.length) throw new AppError(503, "provider_unavailable", "Nenhum adquirente disponível.");
  return eligible[0].a;
}
export async function createChargeWithFailover(ctx: CreateChargeContext, environment: Environment): Promise<ChargeAttemptResult> {
  const maxAttempts = Math.min(Math.max(activeIds().length, 1), MAX);
  const attempted: AcquirerId[] = [...ctx.attemptedProviders];
  let last: ChargeAttemptResult | null = null;
  for (let i = 0; i < maxAttempts; i++) {
    const provider = selectProviderForCharge({ ...ctx, attempt: i, attemptedProviders: attempted }, environment);
    const a = asA(provider);
    const pid = (a?.id ?? (provider as PaymentProvider).name) as AcquirerId;
    attempted.push(pid);
    const t0 = Date.now();
    try {
      const r = await provider.createPayment({ amount: ctx.amountCents, currency: ctx.currency, description: ctx.description, externalId: ctx.externalId, webhookUrl: ctx.webhookUrl, expirationSeconds: ctx.expirationSeconds, metadata: ctx.metadata });
      return { providerId: pid, success: true, providerPaymentId: r.providerPaymentId, status: r.status, pix: r.pix ? { txid: r.pix.txid, copyPaste: r.pix.copyPaste, qrCodeBase64: r.pix.qrCodeBase64, expiresAt: r.pix.expiresAt, feeAmountCents: r.pix.feeAmountCents, netAmountCents: r.pix.netAmountCents } : undefined, rawResponse: r.rawResponse, latencyMs: Date.now() - t0 };
    } catch (err) {
      const e = err as Error & { retryable?: boolean; ambiguous?: boolean };
      last = { providerId: pid, success: false, errorCode: "provider_error", errorMessage: e.message, retryable: e.retryable === true, ambiguous: e.ambiguous === true, latencyMs: Date.now() - t0 };
      if (e.ambiguous || e.retryable !== true) return last;
    }
  }
  return last ?? { providerId: "nexuspag", success: false, errorCode: "provider_unavailable", errorMessage: "indisponível", latencyMs: 0 };
}
export { sandboxProvider, nexuspagProvider, gothampayProvider, smokepayProvider, kavropayProvider };
export type { AcquirerId, AcquirerConfig, ChargeAttemptResult, CreateChargeContext };
