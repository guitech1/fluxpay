import type { PaymentProvider, Environment } from "../types/index.js";
import { AppError } from "../middleware/error.js";
import { supabaseAdmin } from "../config/supabase.js";
import { sandboxProvider } from "./sandbox.js";
import { nexuspagProvider } from "./nexuspag.js";
import { gothampayProvider } from "./gothampay.js";
import { smokepayProvider } from "./smokepay.js";
import { kavropayProvider } from "./kavropay.js";
import { profanuspayProvider } from "./profanuspay.js";
import type { AcquirerAdapter, AcquirerId, AcquirerConfig, ChargeAttemptResult, CreateChargeContext } from "./types.js";
import { DEFAULT_PRIORITY, filterActiveAcquirers, parseActivePool, type RoutingRow } from "./routing.js";
import { CircuitBreaker, readFailoverEnv } from "./failover-policy.js";
import { makeFailoverEngine } from "./failover-engine.js";

const adapters: Record<string, AcquirerAdapter | PaymentProvider> = {
  sandbox: sandboxProvider as unknown as AcquirerAdapter,
  nexuspag: nexuspagProvider as unknown as AcquirerAdapter,
  profanuspay: profanuspayProvider,
  gothampay: gothampayProvider, smokepay: smokepayProvider, kavropay: kavropayProvider,
};

let routingCache: { at: number; rows: RoutingRow[] } | null = null;
const ROUTING_TTL_MS = 5_000;
const cfg0 = readFailoverEnv();
const circuitBreaker = new CircuitBreaker(cfg0.circuitThreshold, cfg0.circuitOpenMs);

function asA(p: PaymentProvider | AcquirerAdapter): AcquirerAdapter | null {
  return "id" in p && typeof (p as AcquirerAdapter).isConfigured === "function" ? (p as AcquirerAdapter) : null;
}

export function isLiveEnabled(): boolean {
  return Boolean(
    process.env.NEXUSPAG_API_KEY ||
    process.env.PROFANUSPAY_API_KEY ||
    process.env.GOTHAMPAY_API_KEY ||
    process.env.SMOKEPAY_API_KEY ||
    process.env.KAVROPAY_API_KEY
  );
}

export function invalidateAcquirerRoutingCache(): void { routingCache = null; }

async function loadRoutingRows(): Promise<RoutingRow[]> {
  if (routingCache && Date.now() - routingCache.at < ROUTING_TTL_MS) return routingCache.rows;
  const { data, error } = await supabaseAdmin.from("acquirer_cost_config").select("acquirer_id, enabled, priority");
  if (error) {
    console.error("[providers] falha ao ler acquirer_cost_config:", error.message);
    return routingCache?.rows ?? [];
  }
  const rows = (data || []) as RoutingRow[];
  routingCache = { at: Date.now(), rows };
  return rows;
}

function isConfiguredId(id: string): boolean {
  if (id === "sandbox") return true;
  return Boolean(asA(adapters[id])?.isConfigured());
}

export async function resolveActiveIds(): Promise<AcquirerId[]> {
  const rows = await loadRoutingRows();
  const pool = parseActivePool(process.env.FLUXPAY_ACTIVE_ACQUIRERS).filter((id) => id in adapters);
  const { ordered, excluded } = filterActiveAcquirers({ pool, rows, isConfigured: isConfiguredId, max: 0 });
  console.info(JSON.stringify({ tag: "acquirer_routing", ordered, excluded, configRows: rows.length }));
  return ordered;
}

export function getProvider(environment: Environment, preferred?: string): PaymentProvider {
  if (environment === "test") return sandboxProvider;
  if (!isLiveEnabled()) throw new AppError(503, "provider_unavailable", "Pagamentos em produção ainda não estão disponíveis nesta conta.");
  if (preferred && preferred !== "sandbox" && adapters[preferred]) return adapters[preferred] as PaymentProvider;
  throw new AppError(503, "provider_unavailable", "Nenhum adquirente preferido na cobrança; use o roteador de criação.");
}

export function listProviders() { return Object.keys(adapters); }
export function getAdapter(id: string) { return adapters[id] ? asA(adapters[id]) : null; }

export function listAcquirerConfigs(): AcquirerConfig[] {
  const names: Record<AcquirerId, string> = {
    nexuspag: "NexusPag",
    profanuspay: "ProfanusPay",
    gothampay: "GothamPay",
    smokepay: "SmokePay",
    kavropay: "KavroPay",
    sandbox: "Sandbox",
  };
  return (["nexuspag", "profanuspay", "gothampay", "smokepay", "kavropay", "sandbox"] as AcquirerId[]).map((id) => {
    const a = asA(adapters[id]);
    const configured = a?.isConfigured() ?? id === "sandbox";
    const limits = a?.getLimits() ?? { minAmountCents: 100, maxAmountCents: 0 };
    const cost = a?.getConfiguredCost() ?? { percent: 0, fixedCents: 0 };
    return {
      id, displayName: names[id], enabled: id === "sandbox" ? true : configured,
      priority: DEFAULT_PRIORITY[id] ?? 100,
      environment: id === "sandbox" ? ("test" as const) : ("live" as const),
      costPercent: cost.percent, costFixedCents: cost.fixedCents,
      minAmountCents: limits.minAmountCents, maxAmountCents: limits.maxAmountCents,
      configured, healthStatus: configured ? ("unknown" as const) : ("unconfigured" as const),
    };
  });
}

export async function selectProviderForCharge(ctx: CreateChargeContext, environment: Environment, orderedIds?: AcquirerId[]) {
  if (environment === "test") return sandboxProvider;
  const ids = orderedIds ?? (await resolveActiveIds());
  const eligible = ids
    .filter((id) => !ctx.attemptedProviders.includes(id))
    .filter((id) => !circuitBreaker.isOpen(id))
    .map((id) => ({ id, a: asA(adapters[id]) }))
    .filter((x): x is { id: AcquirerId; a: AcquirerAdapter } => {
      if (!x.a?.isConfigured()) return false;
      const l = x.a.getLimits();
      if (ctx.amountCents < l.minAmountCents) return false;
      if (l.maxAmountCents > 0 && ctx.amountCents > l.maxAmountCents) return false;
      return true;
    });
  if (!eligible.length) throw new AppError(503, "provider_unavailable", "Nenhum adquirente disponível.");
  return eligible[0].a;
}

const engine = makeFailoverEngine({
  asA,
  resolveActiveIds,
  selectProviderForCharge,
  sandboxCreate: (params) => sandboxProvider.createPayment(params),
  circuitBreaker,
});

export async function createChargeWithFailover(ctx: CreateChargeContext, environment: Environment) {
  return engine.createChargeWithFailover(ctx, environment);
}

export type { AttemptLogEntry } from "./failover-engine.js";
export { sandboxProvider, nexuspagProvider, gothampayProvider, smokepayProvider, kavropayProvider, profanuspayProvider };
export type { AcquirerId, AcquirerConfig, ChargeAttemptResult, CreateChargeContext };
