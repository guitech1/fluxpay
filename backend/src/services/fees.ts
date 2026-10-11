import { supabaseAdmin } from "../config/supabase.js";
import type { AcquirerId, FeeRuleSnapshot } from "../providers/types.js";
export async function calculateFee(params: { amountCents: number; organizationId: string; providerId: AcquirerId; }) {
  let orgRule: any = null; let globalRule: any = null;
  let cost = { percent: 5, fixedCents: 0 };
  try {
    const { data } = await supabaseAdmin.from("organization_fee_rules").select("*").eq("organization_id", params.organizationId).eq("active", true).limit(1).maybeSingle();
    if (data && data.mode !== "inherit") orgRule = data;
  } catch {}
  try {
    const { data } = await supabaseAdmin.from("platform_fee_rules").select("*").eq("active", true).limit(1).maybeSingle();
    globalRule = data;
  } catch {}
  try {
    const { data } = await supabaseAdmin.from("acquirer_cost_config").select("cost_percent, cost_fixed_cents").eq("acquirer_id", params.providerId).maybeSingle();
    if (data) cost = { percent: Number(data.cost_percent), fixedCents: Number(data.cost_fixed_cents) };
    else if (params.providerId === "kavropay") cost = { percent: 2.99, fixedCents: 50 };
    else if (params.providerId === "sandbox") cost = { percent: 0, fixedCents: 0 };
  } catch {}
  const rule = orgRule ?? globalRule;
  const mode = (rule?.mode as FeeRuleSnapshot["mode"]) || "provider_plus_margin";
  const marginPct = Number(rule?.fluxpay_margin_percent ?? 0);
  const marginFix = Number(rule?.fluxpay_fixed_cents ?? 0);
  const amount = params.amountCents;
  const providerCostCents = Math.round((amount * cost.percent) / 100) + cost.fixedCents;
  let totalFee: number; let totalPercent: number; let totalFixed: number;
  if (mode === "provider_only") { totalFee = providerCostCents; totalPercent = cost.percent; totalFixed = cost.fixedCents; }
  else if (mode === "custom_total") {
    const p = Number(rule?.custom_total_percent ?? 0); const f = Number(rule?.custom_total_fixed_cents ?? 0);
    totalFee = Math.round((amount * p) / 100) + f; totalPercent = p; totalFixed = f;
  } else {
    const m = Math.round((amount * marginPct) / 100) + marginFix;
    totalFee = providerCostCents + m; totalPercent = cost.percent + marginPct; totalFixed = cost.fixedCents + marginFix;
  }
  totalFee = Math.max(0, Math.min(totalFee, amount));
  const snapshot: FeeRuleSnapshot = {
    mode, providerCostPercent: cost.percent, providerCostFixedCents: cost.fixedCents,
    fluxpayMarginPercent: marginPct, fluxpayFixedCents: marginFix, totalPercent, totalFixedCents: totalFixed,
    ruleSource: orgRule ? "individual" : globalRule ? "global" : "fallback",
    ruleId: rule?.id ?? null, calculatedAt: new Date().toISOString(), providerId: params.providerId,
  };
  return { snapshot, feeAmountCents: totalFee, netAmountCents: amount - totalFee, providerCostCents, fluxpayRevenueCents: Math.max(0, totalFee - providerCostCents) };
}
