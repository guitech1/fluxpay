import test from "node:test";
import assert from "node:assert/strict";
import {
  CircuitBreaker,
  attemptTimeoutMs,
  classifyProviderError,
  computeMaxAttempts,
  readFailoverEnv,
  remainingBudgetMs,
} from "../src/providers/failover-policy.js";
import { filterActiveAcquirers } from "../src/providers/routing.js";

test("falha 5xx → failover imediato", () => {
  const d = classifyProviderError({ statusCode: 503, retryable: true });
  assert.equal(d.continueFailover, true);
  assert.equal(d.category, "transient");
});

test("auth 401 → continua para outro adquirente + classificacao", () => {
  const d = classifyProviderError({ statusCode: 401, retryable: false });
  assert.equal(d.continueFailover, true);
  assert.equal(d.category, "definitive");
});

test("timeout/abort → NÃO failover (anti-duplicacao)", () => {
  const d = classifyProviderError({ ambiguous: true, name: "AbortError", message: "timeout" });
  assert.equal(d.continueFailover, false);
  assert.equal(d.category, "unknown");
});

test("4xx validacao → pode tentar proximo", () => {
  const d = classifyProviderError({ statusCode: 400, retryable: false });
  assert.equal(d.continueFailover, true);
});

test("rede/econnrefused → pode tentar proximo", () => {
  assert.equal(classifyProviderError({ message: "rede" }).continueFailover, true);
  assert.equal(classifyProviderError({ message: "ECONNREFUSED" }).continueFailover, true);
});

test("desativada nunca entra", () => {
  const { ordered } = filterActiveAcquirers({
    pool: ["gothampay", "smokepay", "kavropay", "nexuspag"],
    rows: [
      { acquirer_id: "gothampay", enabled: true, priority: 10 },
      { acquirer_id: "smokepay", enabled: false, priority: 20 },
      { acquirer_id: "kavropay", enabled: true, priority: 30 },
      { acquirer_id: "nexuspag", enabled: true, priority: 40 },
    ],
    isConfigured: () => true,
    max: 0,
  });
  assert.deepEqual(ordered, ["gothampay", "kavropay", "nexuspag"]);
});

test("prioridade admin", () => {
  const { ordered } = filterActiveAcquirers({
    pool: ["nexuspag", "gothampay", "smokepay"],
    rows: [
      { acquirer_id: "nexuspag", enabled: true, priority: 90 },
      { acquirer_id: "gothampay", enabled: true, priority: 5 },
      { acquirer_id: "smokepay", enabled: true, priority: 15 },
    ],
    isConfigured: () => true,
    max: 0,
  });
  assert.deepEqual(ordered, ["gothampay", "smokepay", "nexuspag"]);
});

test("sem teto artificial: 4 e 10 elegiveis", () => {
  assert.equal(computeMaxAttempts({ orderedLength: 4, envMax: 0 }), 4);
  assert.equal(computeMaxAttempts({ orderedLength: 10, envMax: 0 }), 10);
  assert.equal(computeMaxAttempts({ orderedLength: 10, envMax: 3 }), 3);
});

test("defaults 2000/5000", () => {
  const cfg = readFailoverEnv({});
  assert.equal(cfg.perAttemptTimeoutMs, 2000);
  assert.equal(cfg.totalBudgetMs, 5000);
  assert.equal(cfg.maxAttempts, 0);
});

test("orcamento global nao reinicia por tentativa", () => {
  const started = 1_000_000;
  assert.equal(remainingBudgetMs({ startedAt: started, totalBudgetMs: 5000, now: started + 2000 }), 3000);
  assert.equal(remainingBudgetMs({ startedAt: started, totalBudgetMs: 5000, now: started + 5000 }), 0);
  assert.equal(
    attemptTimeoutMs({ remainingBudgetMs: 1500, perAttemptTimeoutMs: 2000 }),
    1500
  );
  assert.equal(attemptTimeoutMs({ remainingBudgetMs: 0, perAttemptTimeoutMs: 2000 }), 0);
});

test("circuit breaker", () => {
  const cb = new CircuitBreaker(2, 60_000);
  cb.recordFailure("gothampay");
  assert.equal(cb.isOpen("gothampay"), false);
  cb.recordFailure("gothampay");
  assert.equal(cb.isOpen("gothampay"), true);
  cb.recordSuccess("gothampay");
  assert.equal(cb.isOpen("gothampay"), false);
});

async function simulateFailover(
  providers: Array<{
    id: string;
    run: () => Promise<{ ok: true } | { ok: false; err: Parameters<typeof classifyProviderError>[0] }>;
  }>,
  opts: { totalBudgetMs: number; perAttemptTimeoutMs: number; nowSteps?: number[] }
) {
  let clock = 0;
  const startedAt = 0;
  const log: Array<{ id: string; outcome: string; at: number }> = [];
  for (let i = 0; i < providers.length; i++) {
    const now = opts.nowSteps?.[i] ?? clock;
    const budget = remainingBudgetMs({
      startedAt,
      totalBudgetMs: opts.totalBudgetMs,
      now,
    });
    if (attemptTimeoutMs({ remainingBudgetMs: budget, perAttemptTimeoutMs: opts.perAttemptTimeoutMs }) <= 0) {
      return { success: false, providerId: null, log, stop: "budget_exhausted", totalMs: now };
    }
    const p = providers[i];
    const result = await p.run();
    clock = now + 100;
    if (result.ok) {
      log.push({ id: p.id, outcome: "success", at: clock });
      return { success: true, providerId: p.id, log, totalMs: clock };
    }
    const d = classifyProviderError(result.err);
    log.push({ id: p.id, outcome: d.category, at: clock });
    if (!d.continueFailover) {
      return { success: false, providerId: p.id, log, stop: d.reason, totalMs: clock };
    }
  }
  return { success: false, providerId: null, log, stop: "exhausted", totalMs: clock };
}

test("sim: 1a falha + 2a sucesso (imediato)", async () => {
  const r = await simulateFailover(
    [
      { id: "gothampay", run: async () => ({ ok: false, err: { statusCode: 503, retryable: true } }) },
      { id: "smokepay", run: async () => ({ ok: true }) },
    ],
    { totalBudgetMs: 5000, perAttemptTimeoutMs: 2000 }
  );
  assert.equal(r.success, true);
  assert.equal(r.providerId, "smokepay");
  assert.equal(r.log.length, 2);
  assert.ok((r.totalMs ?? 0) < 5000);
});

test("sim: 2 falhas + 3a sucesso", async () => {
  const r = await simulateFailover(
    [
      { id: "a", run: async () => ({ ok: false, err: { statusCode: 500, retryable: true } }) },
      { id: "b", run: async () => ({ ok: false, err: { statusCode: 502, retryable: true } }) },
      { id: "c", run: async () => ({ ok: true }) },
    ],
    { totalBudgetMs: 5000, perAttemptTimeoutMs: 2000 }
  );
  assert.equal(r.success, true);
  assert.equal(r.providerId, "c");
  assert.equal(r.log.length, 3);
});

test("sim: 4 elegiveis tentaveis", async () => {
  let calls = 0;
  const r = await simulateFailover(
    [
      { id: "a", run: async () => { calls++; return { ok: false, err: { statusCode: 500, retryable: true } }; } },
      { id: "b", run: async () => { calls++; return { ok: false, err: { statusCode: 500, retryable: true } }; } },
      { id: "c", run: async () => { calls++; return { ok: false, err: { statusCode: 500, retryable: true } }; } },
      { id: "d", run: async () => { calls++; return { ok: true }; } },
    ],
    { totalBudgetMs: 5000, perAttemptTimeoutMs: 2000, nowSteps: [0, 100, 200, 300] }
  );
  assert.equal(r.success, true);
  assert.equal(calls, 4);
  assert.equal(r.providerId, "d");
});

test("sim: todas falham", async () => {
  const r = await simulateFailover(
    [
      { id: "a", run: async () => ({ ok: false, err: { statusCode: 500, retryable: true } }) },
      { id: "b", run: async () => ({ ok: false, err: { statusCode: 500, retryable: true } }) },
    ],
    { totalBudgetMs: 5000, perAttemptTimeoutMs: 2000 }
  );
  assert.equal(r.success, false);
  assert.equal(r.stop, "exhausted");
});

test("sim: timeout nao cria 2a cobranca", async () => {
  let second = false;
  const r = await simulateFailover(
    [
      { id: "a", run: async () => ({ ok: false, err: { ambiguous: true, name: "AbortError", message: "timeout" } }) },
      { id: "b", run: async () => { second = true; return { ok: true }; } },
    ],
    { totalBudgetMs: 5000, perAttemptTimeoutMs: 2000 }
  );
  assert.equal(second, false);
  assert.equal(r.log[0].outcome, "unknown");
});

test("sim: orcamento 5s esgota e deixa estado rastreavel", async () => {
  const r = await simulateFailover(
    [
      { id: "a", run: async () => ({ ok: false, err: { statusCode: 500, retryable: true } }) },
      { id: "b", run: async () => ({ ok: false, err: { statusCode: 500, retryable: true } }) },
      { id: "c", run: async () => ({ ok: true }) },
    ],
    { totalBudgetMs: 5000, perAttemptTimeoutMs: 2000, nowSteps: [0, 4500, 5001] }
  );
  assert.equal(r.success, false);
  assert.equal(r.stop, "budget_exhausted");
  assert.ok(r.log.length <= 2);
});
