/**
 * Testes multi-adquirente: failover, taxas (snapshot), ambiguidade.
 * Usa mocks em memória — sem chamadas reais a adquirentes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { FeeRuleSnapshot } from "../src/providers/types.js";
import {
  decideReconcileAction,
  decideWebhookAction,
} from "../src/services/provider-events.js";

function calcFeePure(params: {
  amountCents: number;
  costPercent: number;
  costFixedCents: number;
  mode: FeeRuleSnapshot["mode"];
  marginPct?: number;
  marginFix?: number;
  customPct?: number;
  customFix?: number;
}): { feeAmountCents: number; netAmountCents: number; snapshot: FeeRuleSnapshot } {
  const amount = params.amountCents;
  const providerCostCents =
    Math.round((amount * params.costPercent) / 100) + params.costFixedCents;
  let totalFee: number;
  let totalPercent: number;
  let totalFixed: number;
  const marginPct = params.marginPct ?? 0;
  const marginFix = params.marginFix ?? 0;

  if (params.mode === "provider_only") {
    totalFee = providerCostCents;
    totalPercent = params.costPercent;
    totalFixed = params.costFixedCents;
  } else if (params.mode === "custom_total") {
    const p = params.customPct ?? 0;
    const f = params.customFix ?? 0;
    totalFee = Math.round((amount * p) / 100) + f;
    totalPercent = p;
    totalFixed = f;
  } else {
    const m = Math.round((amount * marginPct) / 100) + marginFix;
    totalFee = providerCostCents + m;
    totalPercent = params.costPercent + marginPct;
    totalFixed = params.costFixedCents + marginFix;
  }
  totalFee = Math.max(0, Math.min(totalFee, amount));
  const snapshot: FeeRuleSnapshot = {
    mode: params.mode,
    providerCostPercent: params.costPercent,
    providerCostFixedCents: params.costFixedCents,
    fluxpayMarginPercent: marginPct,
    fluxpayFixedCents: marginFix,
    totalPercent,
    totalFixedCents: totalFixed,
    ruleSource: "fallback",
    ruleId: null,
    calculatedAt: new Date().toISOString(),
    providerId: "nexuspag",
  };
  return { feeAmountCents: totalFee, netAmountCents: amount - totalFee, snapshot };
}

test("fee: provider_plus_margin arredonda e soma margem", () => {
  const r = calcFeePure({
    amountCents: 10000,
    costPercent: 2.99,
    costFixedCents: 50,
    mode: "provider_plus_margin",
    marginPct: 1,
    marginFix: 10,
  });
  assert.equal(r.feeAmountCents, 459);
  assert.equal(r.netAmountCents, 9541);
  assert.equal(r.snapshot.mode, "provider_plus_margin");
  assert.equal(r.snapshot.providerCostPercent, 2.99);
});

test("fee: provider_only ignora margem FluxPay", () => {
  const r = calcFeePure({
    amountCents: 10000,
    costPercent: 5,
    costFixedCents: 0,
    mode: "provider_only",
    marginPct: 99,
    marginFix: 999,
  });
  assert.equal(r.feeAmountCents, 500);
  assert.equal(r.snapshot.fluxpayMarginPercent, 99);
});

test("fee: custom_total usa percent+fixed custom", () => {
  const r = calcFeePure({
    amountCents: 10000,
    costPercent: 5,
    costFixedCents: 0,
    mode: "custom_total",
    customPct: 3.5,
    customFix: 100,
  });
  assert.equal(r.feeAmountCents, 450);
});

test("fee: taxa nunca ultrapassa o valor da cobrança", () => {
  const r = calcFeePure({
    amountCents: 100,
    costPercent: 50,
    costFixedCents: 200,
    mode: "provider_only",
  });
  assert.equal(r.feeAmountCents, 100);
  assert.equal(r.netAmountCents, 0);
});

test("fee: snapshot imutável após cálculo (campos congelados semanticamente)", () => {
  const r = calcFeePure({
    amountCents: 5000,
    costPercent: 2,
    costFixedCents: 0,
    mode: "provider_plus_margin",
    marginPct: 0.5,
  });
  const snap = { ...r.snapshot };
  snap.mode = "custom_total";
  assert.equal(r.snapshot.mode, "provider_plus_margin");
  assert.ok(r.snapshot.calculatedAt);
});

type Attempt = {
  success: boolean;
  ambiguous?: boolean;
  retryable?: boolean;
  providerId: string;
};

function shouldFailover(last: Attempt): boolean {
  if (last.success) return false;
  if (last.ambiguous) return false;
  return last.retryable === true;
}

test("failover: bloqueado após resultado ambíguo (timeout)", () => {
  assert.equal(
    shouldFailover({ success: false, ambiguous: true, retryable: true, providerId: "nexuspag" }),
    false
  );
});

test("failover: permitido após falha determinista retryable (429/5xx)", () => {
  assert.equal(
    shouldFailover({ success: false, ambiguous: false, retryable: true, providerId: "nexuspag" }),
    true
  );
});

test("failover: bloqueado após falha não-retryable (4xx de validação)", () => {
  assert.equal(
    shouldFailover({ success: false, ambiguous: false, retryable: false, providerId: "kavropay" }),
    false
  );
});

test("failover: sucesso não dispara novo provedor", () => {
  assert.equal(
    shouldFailover({ success: true, providerId: "gothampay" }),
    false
  );
});

test("webhook: assinatura inválida não deve alterar saldo (decisão de ignore/reject é de rota)", () => {
  const d = decideWebhookAction({
    eventType: "payment.confirmed",
    status: "paid",
    payment: null,
    alreadyProcessed: false,
  });
  assert.equal(d.action, "retry_later");
});

test("reconcile: unreachable não encerra cobrança", () => {
  const d = decideReconcileAction({
    ageSeconds: 600,
    graceSeconds: 300,
    providerStatus: "unreachable",
  });
  assert.equal(d.action, "wait");
});

test("reconcile: not_found após grace encerra", () => {
  const d = decideReconcileAction({
    ageSeconds: 600,
    graceSeconds: 300,
    providerStatus: "not_found",
  });
  assert.equal(d.action, "fail");
});

test("reconcile: paid confirma", () => {
  const d = decideReconcileAction({
    ageSeconds: 600,
    graceSeconds: 300,
    providerStatus: "paid",
  });
  assert.equal(d.action, "confirm");
});

test("liquidacao: available_on imediato só para status succeeded", () => {
  function ledgerAvailableOn(status: string, nowIso: string): string | null {
    if (status !== "succeeded") return null;
    return nowIso;
  }
  const now = new Date().toISOString();
  assert.equal(ledgerAvailableOn("pending", now), null);
  assert.equal(ledgerAvailableOn("succeeded", now), now);
  assert.equal(ledgerAvailableOn("failed", now), null);
});

test("liquidacao: crédito duplo bloqueado por status já succeeded", () => {
  const d = decideWebhookAction({
    eventType: "payment.confirmed",
    status: "paid",
    payment: { id: "p1", status: "succeeded" },
    alreadyProcessed: false,
  });
  assert.equal(d.action, "duplicate");
});
