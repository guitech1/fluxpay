import type { PaymentProvider, Environment } from "../types/index.js";
import { AppError } from "../middleware/error.js";
import { supabaseAdmin } from "../config/supabase.js";
import { sandboxProvider } from "./sandbox.js";
import { nexuspagProvider } from "./nexuspag.js";
import { gothampayProvider } from "./gothampay.js";
import { smokepayProvider } from "./smokepay.js";
import { kavropayProvider } from "./kavropay.js";
import type { AcquirerAdapter, AcquirerId, AcquirerConfig, ChargeAttemptResult, CreateChargeContext } from "./types.js";

const adapters: Record<string, AcquirerAdapter | PaymentProvider> = {
  sandbox: sandboxProvider as unknown as AcquirerAdapter,
  nexuspag: nexuspagProvider as unknown as AcquirerAdapter,
  gothampay: gothampayProvider,
  smokepay: smokepayProvider,
  kavropay: kavropayProvider,
};

const DEFAULT_PRIORITY: Record<AcquirerId, number> = {
  sandbox: 999,
  nexuspag: 10,
  gothampay: 20,
  smokepay: 30,
  kavropay: 40,
};

const MAX = 3;

type RoutingRow = {
  acquirer_id: string;
  enabled: boolean;
  priority: number;
};

let routingCache: { at: number; rows: RoutingRow[] } | null = null;
const ROUTING_TTL_MS = 10_000;

function asA(p: PaymentProvider | AcquirerAdapter): AcquirerAdapter | null {
  return "id" in p && typeof (p as AcquirerAdapter).isConfigured === "function"
    ? (p as AcquirerAdapter)
    : null;
}

export function isLiveEnabled(): boolean {
  return Boolean(
    process.env.NEXUSPAG_API_KEY ||
      process.env.GOTHAMPAY_API_KEY ||
      process.env.SMOKEPAY_API_KEY ||
      process.env.KAVROPAY_API_KEY
  );
}

/** Invalida cache após PATCH no admin (enabled/priority). */
export function invalidateAcquirerRoutingCache(): void {
  routingCache = null;
}

async function loadRoutingRows(): Promise<RoutingRow[]> {
  if (routingCache && Date.now() - routingCache.at < ROUTING_TTL_MS) {
    return routingCache.rows;
  }
  const { data, error } = await supabaseAdmin
    .from("acquirer_cost_config")
    .select("acquirer_id, enabled, priority");
  if (error) {
    console.error("[providers] falha ao ler acquirer_cost_config:", error.message);
    return routingCache?.rows ?? [];
  }
  const rows = (data || []) as RoutingRow[];
  routingCache = { at: Date.now(), rows };
  return rows;
}

function candidatePool(): AcquirerId[] {
  const raw = process.env.FLUXPAY_ACTIVE_ACQUIRERS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((id): id is AcquirerId => id in adapters && id !== "sandbox");
  }
  return ["nexuspag", "gothampay", "smokepay", "kavropay"];
}

/**
 * Lista adquirentes que podem gerar cobrança live:
 * 1) na pool (env ou default)
 * 2) com API key configurada
 * 3) enabled=true no admin (acquirer_cost_config); se não houver linha, assume true
 * Ordenado por priority do admin (menor primeiro).
 */
export async function resolveActiveIds(): Promise<AcquirerId[]> {
  const rows = await loadRoutingRows();
  const byId = new Map(rows.map((r) => [String(r.acquirer_id).toLowerCase(), r]));

  return candidatePool()
    .filter((id) => {
      if (!asA(adapters[id])?.isConfigured()) return false;
      const row = byId.get(id);
      // Sem linha no banco: permite (só chave). Com linha: respeita enabled do admin.
      if (row && row.enabled === false) return false;
      return true;
    })
    .sort((a, b) => {
      const pa = byId.get(a)?.priority ?? DEFAULT_PRIORITY[a];
      const pb = byId.get(b)?.priority ?? DEFAULT_PRIORITY[b];
      return Number(pa) - Number(pb);
    })
    .slice(0, MAX);
}

/** Sync fallback (refunds/webhooks com preferred já gravado). */
function activeIdsSyncFallback(): AcquirerId[] {
  return candidatePool()
    .filter((id) => asA(adapters[id])?.isConfigured())
    .sort((a, b) => DEFAULT_PRIORITY[a] - DEFAULT_PRIORITY[b])
    .slice(0, MAX);
}

export function getProvider(environment: Environment, preferred?: string): PaymentProvider {
  if (environment === "test") return sandboxProvider;
  if (!isLiveEnabled()) {
    throw new AppError(
      503,
      "provider_unavailable",
      "Pagamentos em produção ainda não estão disponíveis nesta conta."
    );
  }
  if (preferred && preferred !== "sandbox" && adapters[preferred]) {
    return adapters[preferred] as PaymentProvider;
  }
  for (const id of activeIdsSyncFallback()) {
    if (asA(adapters[id])?.isConfigured()) return adapters[id] as PaymentProvider;
  }
  throw new AppError(503, "provider_unavailable", "Nenhum adquirente válido configurado.");
}

export function listProviders() {
  return Object.keys(adapters);
}

export function getAdapter(id: string) {
  return adapters[id] ? asA(adapters[id]) : null;
}

export function listAcquirerConfigs(): AcquirerConfig[] {
  const names: Record<AcquirerId, string> = {
    nexuspag: "NexusPag",
    gothampay: "GothamPay",
    smokepay: "SmokePay",
    kavropay: "KavroPay",
    sandbox: "Sandbox",
  };
  return (["nexuspag", "gothampay", "smokepay", "kavropay", "sandbox"] as AcquirerId[]).map((id) => {
    const a = asA(adapters[id]);
    const configured = a?.isConfigured() ?? id === "sandbox";
    const limits = a?.getLimits() ?? { minAmountCents: 100, maxAmountCents: 0 };
    const cost = a?.getConfiguredCost() ?? { percent: 0, fixedCents: 0 };
    return {
      id,
      displayName: names[id],
      enabled: id === "sandbox" ? true : configured,
      priority: DEFAULT_PRIORITY[id],
      environment: id === "sandbox" ? ("test" as const) : ("live" as const),
      costPercent: cost.percent,
      costFixedCents: cost.fixedCents,
      minAmountCents: limits.minAmountCents,
      maxAmountCents: limits.maxAmountCents,
      configured,
      healthStatus: configured ? ("unknown" as const) : ("unconfigured" as const),
    };
  });
}

export async function selectProviderForCharge(
  ctx: CreateChargeContext,
  environment: Environment,
  orderedIds?: AcquirerId[]
) {
  if (environment === "test") return sandboxProvider;

  const ids = orderedIds ?? (await resolveActiveIds());
  const eligible = ids
    .filter((id) => !ctx.attemptedProviders.includes(id))
    .map((id) => ({ id, a: asA(adapters[id]) }))
    .filter((x): x is { id: AcquirerId; a: AcquirerAdapter } => {
      if (!x.a?.isConfigured()) return false;
      const l = x.a.getLimits();
      if (ctx.amountCents < l.minAmountCents) return false;
      if (l.maxAmountCents > 0 && ctx.amountCents > l.maxAmountCents) return false;
      return true;
    });

  if (!eligible.length) {
    throw new AppError(503, "provider_unavailable", "Nenhum adquirente disponível.");
  }
  return eligible[0].a;
}

export async function createChargeWithFailover(
  ctx: CreateChargeContext,
  environment: Environment
): Promise<ChargeAttemptResult> {
  if (environment === "test") {
    const t0 = Date.now();
    const r = await sandboxProvider.createPayment({
      amount: ctx.amountCents,
      currency: ctx.currency,
      description: ctx.description,
      externalId: ctx.externalId,
      webhookUrl: ctx.webhookUrl,
      expirationSeconds: ctx.expirationSeconds,
      metadata: ctx.metadata,
    });
    return {
      providerId: "sandbox",
      success: true,
      providerPaymentId: r.providerPaymentId,
      status: r.status,
      pix: r.pix
        ? {
            txid: r.pix.txid,
            copyPaste: r.pix.copyPaste,
            qrCodeBase64: r.pix.qrCodeBase64,
            expiresAt: r.pix.expiresAt,
            feeAmountCents: r.pix.feeAmountCents,
            netAmountCents: r.pix.netAmountCents,
          }
        : undefined,
      rawResponse: r.rawResponse,
      latencyMs: Date.now() - t0,
    };
  }

  const ordered = await resolveActiveIds();
  console.info("[providers] routing live:", ordered.join(",") || "(nenhum)");

  if (!ordered.length) {
    return {
      providerId: "nexuspag",
      success: false,
      errorCode: "provider_unavailable",
      errorMessage: "Nenhum adquirente ativo no admin com chave configurada.",
      latencyMs: 0,
    };
  }

  const maxAttempts = Math.min(Math.max(ordered.length, 1), MAX);
  const attempted: AcquirerId[] = [...ctx.attemptedProviders];
  let last: ChargeAttemptResult | null = null;

  for (let i = 0; i < maxAttempts; i++) {
    const provider = await selectProviderForCharge(
      { ...ctx, attempt: i, attemptedProviders: attempted },
      environment,
      ordered
    );
    const a = asA(provider);
    const pid = (a?.id ?? (provider as PaymentProvider).name) as AcquirerId;
    attempted.push(pid);
    const t0 = Date.now();
    try {
      const r = await provider.createPayment({
        amount: ctx.amountCents,
        currency: ctx.currency,
        description: ctx.description,
        externalId: ctx.externalId,
        webhookUrl: ctx.webhookUrl,
        expirationSeconds: ctx.expirationSeconds,
        metadata: ctx.metadata,
      });
      return {
        providerId: pid,
        success: true,
        providerPaymentId: r.providerPaymentId,
        status: r.status,
        pix: r.pix
          ? {
              txid: r.pix.txid,
              copyPaste: r.pix.copyPaste,
              qrCodeBase64: r.pix.qrCodeBase64,
              expiresAt: r.pix.expiresAt,
              feeAmountCents: r.pix.feeAmountCents,
              netAmountCents: r.pix.netAmountCents,
            }
          : undefined,
        rawResponse: r.rawResponse,
        latencyMs: Date.now() - t0,
      };
    } catch (err) {
      const e = err as Error & { retryable?: boolean; ambiguous?: boolean };
      last = {
        providerId: pid,
        success: false,
        errorCode: "provider_error",
        errorMessage: e.message,
        retryable: e.retryable === true,
        ambiguous: e.ambiguous === true,
        latencyMs: Date.now() - t0,
      };
      if (e.ambiguous || e.retryable !== true) return last;
    }
  }

  return (
    last ?? {
      providerId: ordered[0] ?? "nexuspag",
      success: false,
      errorCode: "provider_unavailable",
      errorMessage: "indisponível",
      latencyMs: 0,
    }
  );
}

export { sandboxProvider, nexuspagProvider, gothampayProvider, smokepayProvider, kavropayProvider };
export type { AcquirerId, AcquirerConfig, ChargeAttemptResult, CreateChargeContext };
