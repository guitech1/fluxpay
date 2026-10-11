import type { PaymentProvider, Environment } from "../types/index.js";
import type { AcquirerAdapter, AcquirerId, ChargeAttemptResult, CreateChargeContext } from "./types.js";
import {
  CircuitBreaker, attemptTimeoutMs, classifyProviderError, computeMaxAttempts,
  readFailoverEnv, remainingBudgetMs,
} from "./failover-policy.js";

export type AttemptLogEntry = {
  providerId: string; attempt: number;
  outcome: "success" | "failed" | "skipped" | "unknown";
  category?: string; reason?: string; latencyMs: number; message?: string;
};

export function makeFailoverEngine(deps: {
  asA: (p: PaymentProvider | AcquirerAdapter) => AcquirerAdapter | null;
  resolveActiveIds: () => Promise<AcquirerId[]>;
  selectProviderForCharge: (ctx: CreateChargeContext, env: Environment, ordered?: AcquirerId[]) => Promise<PaymentProvider | AcquirerAdapter>;
  sandboxCreate: (params: any) => Promise<any>;
  circuitBreaker: CircuitBreaker;
}) {
  const circuitBreaker = deps.circuitBreaker;

  return {
    circuitBreaker,
    isCircuitOpen: (id: string) => circuitBreaker.isOpen(id),
    async createChargeWithFailover(ctx: CreateChargeContext, environment: Environment): Promise<ChargeAttemptResult & { attemptLog?: AttemptLogEntry[] }> {
      const cfg = readFailoverEnv();
      const startedAt = Date.now();
      const attemptLog: AttemptLogEntry[] = [];

      if (environment === "test") {
        const t0 = Date.now();
        const r = await deps.sandboxCreate({
          amount: ctx.amountCents, currency: ctx.currency, description: ctx.description,
          externalId: ctx.externalId, webhookUrl: ctx.webhookUrl,
          expirationSeconds: ctx.expirationSeconds, metadata: ctx.metadata,
        });
        const latencyMs = Date.now() - t0;
        attemptLog.push({ providerId: "sandbox", attempt: 0, outcome: "success", latencyMs });
        return {
          providerId: "sandbox", success: true, providerPaymentId: r.providerPaymentId, status: r.status,
          pix: r.pix ? { txid: r.pix.txid, copyPaste: r.pix.copyPaste, qrCodeBase64: r.pix.qrCodeBase64, expiresAt: r.pix.expiresAt, feeAmountCents: r.pix.feeAmountCents, netAmountCents: r.pix.netAmountCents } : undefined,
          rawResponse: r.rawResponse, latencyMs, attemptLog,
        };
      }

      const ordered = await deps.resolveActiveIds();
      const maxAttempts = computeMaxAttempts({ orderedLength: ordered.length, envMax: cfg.maxAttempts });
      console.info(JSON.stringify({ tag: "acquirer_failover_start", paymentExternalId: ctx.externalId ?? null, ordered, maxAttempts, totalBudgetMs: cfg.totalBudgetMs, perAttemptTimeoutMs: cfg.perAttemptTimeoutMs }));

      if (!ordered.length || maxAttempts === 0) {
        return { providerId: "none", success: false, errorCode: "provider_unavailable", errorMessage: "Nenhum adquirente ativo no admin com chave configurada (sem fallback).", latencyMs: 0, attemptLog };
      }

      const attempted: AcquirerId[] = [...ctx.attemptedProviders];
      let last: ChargeAttemptResult | null = null;

      for (let i = 0; i < maxAttempts; i++) {
        const budgetLeft = remainingBudgetMs({ startedAt, totalBudgetMs: cfg.totalBudgetMs });
        const sliceMs = attemptTimeoutMs({ remainingBudgetMs: budgetLeft, perAttemptTimeoutMs: cfg.perAttemptTimeoutMs });
        if (sliceMs <= 0) {
          console.warn(JSON.stringify({ tag: "acquirer_failover_completed", paymentExternalId: ctx.externalId ?? null, reason: "budget_exhausted", attempted, totalMs: Date.now() - startedAt }));
          break;
        }

        const remaining = ordered.filter((id) => !attempted.includes(id) && !circuitBreaker.isOpen(id));
        if (!remaining.length) {
          for (const id of ordered.filter((x) => !attempted.includes(x))) {
            attemptLog.push({ providerId: id, attempt: i, outcome: "skipped", category: "circuit_open", reason: "circuit_open", latencyMs: 0 });
            attempted.push(id);
          }
          break;
        }

        let provider: PaymentProvider | AcquirerAdapter;
        try {
          provider = await deps.selectProviderForCharge({ ...ctx, attempt: i, attemptedProviders: attempted }, environment, ordered);
        } catch { break; }

        const a = deps.asA(provider);
        const pid = (a?.id ?? (provider as PaymentProvider).name) as AcquirerId;
        attempted.push(pid);
        console.info(JSON.stringify({ tag: "acquirer_attempt_started", paymentExternalId: ctx.externalId ?? null, providerId: pid, attempt: i, timeoutMs: sliceMs, ordered }));

        const prevTimeout = process.env.FLUXPAY_ACQUIRER_ATTEMPT_TIMEOUT_MS;
        process.env.FLUXPAY_ACQUIRER_ATTEMPT_TIMEOUT_MS = String(sliceMs);
        const t0 = Date.now();
        try {
          const r = await provider.createPayment({
            amount: ctx.amountCents, currency: ctx.currency, description: ctx.description,
            externalId: ctx.externalId, webhookUrl: ctx.webhookUrl,
            expirationSeconds: ctx.expirationSeconds, metadata: ctx.metadata,
          });
          if (prevTimeout === undefined) delete process.env.FLUXPAY_ACQUIRER_ATTEMPT_TIMEOUT_MS;
          else process.env.FLUXPAY_ACQUIRER_ATTEMPT_TIMEOUT_MS = prevTimeout;
          circuitBreaker.recordSuccess(pid);
          const latencyMs = Date.now() - t0;
          attemptLog.push({ providerId: pid, attempt: i, outcome: "success", latencyMs });
          console.info(JSON.stringify({ tag: "acquirer_attempt_succeeded", paymentExternalId: ctx.externalId ?? null, providerId: pid, attempt: i, latencyMs }));
          console.info(JSON.stringify({ tag: "acquirer_failover_completed", paymentExternalId: ctx.externalId ?? null, finalProviderId: pid, success: true, attempts: attemptLog.length, totalMs: Date.now() - startedAt }));
          return {
            providerId: pid, success: true, providerPaymentId: r.providerPaymentId, status: r.status,
            pix: r.pix ? { txid: r.pix.txid, copyPaste: r.pix.copyPaste, qrCodeBase64: r.pix.qrCodeBase64, expiresAt: r.pix.expiresAt, feeAmountCents: r.pix.feeAmountCents, netAmountCents: r.pix.netAmountCents } : undefined,
            rawResponse: r.rawResponse, latencyMs, attemptLog,
          };
        } catch (err) {
          if (prevTimeout === undefined) delete process.env.FLUXPAY_ACQUIRER_ATTEMPT_TIMEOUT_MS;
          else process.env.FLUXPAY_ACQUIRER_ATTEMPT_TIMEOUT_MS = prevTimeout;
          const e = err as Error & { retryable?: boolean; ambiguous?: boolean; statusCode?: number; name?: string };
          const decision = classifyProviderError(e);
          const latencyMs = Date.now() - t0;
          last = {
            providerId: pid, success: false,
            errorCode: decision.category === "unknown" ? "provider_uncertain" : "provider_error",
            errorMessage: e.message, retryable: decision.continueFailover,
            ambiguous: decision.category === "unknown", latencyMs,
          };
          attemptLog.push({
            providerId: pid, attempt: i,
            outcome: decision.category === "unknown" ? "unknown" : "failed",
            category: decision.category, reason: decision.reason, latencyMs, message: e.message?.slice(0, 200),
          });
          if (decision.category === "unknown") {
            console.warn(JSON.stringify({ tag: "acquirer_attempt_unknown", paymentExternalId: ctx.externalId ?? null, providerId: pid, attempt: i, reason: decision.reason, latencyMs }));
          } else {
            circuitBreaker.recordFailure(pid);
            console.warn(JSON.stringify({ tag: "acquirer_attempt_failed", paymentExternalId: ctx.externalId ?? null, providerId: pid, attempt: i, category: decision.category, reason: decision.reason, latencyMs, message: e.message?.slice(0, 200) }));
          }
          if (!decision.continueFailover) {
            console.info(JSON.stringify({ tag: "acquirer_failover_completed", paymentExternalId: ctx.externalId ?? null, finalProviderId: pid, success: false, stopReason: decision.reason, attempts: attemptLog.length, totalMs: Date.now() - startedAt }));
            return { ...last, attemptLog };
          }
        }
      }

      console.info(JSON.stringify({ tag: "acquirer_failover_completed", paymentExternalId: ctx.externalId ?? null, success: false, stopReason: "exhausted", attempts: attemptLog.length, totalMs: Date.now() - startedAt }));
      return {
        ...(last ?? { providerId: ordered[0] ?? "none", success: false, errorCode: "provider_unavailable", errorMessage: "indisponivel", latencyMs: 0 }),
        attemptLog,
      };
    },
  };
}
