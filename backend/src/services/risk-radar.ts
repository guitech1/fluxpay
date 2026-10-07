import { supabaseAdmin } from "../config/supabase.js";
import type { Environment } from "../types/index.js";

export type RiskLevel = "normal" | "attention" | "elevated";

export interface RiskSignal {
  level: RiskLevel;
  indicator: string;
  title: string;
  explanation: string;
  detected_at: string;
  metrics: Record<string, number | string>;
}

/**
 * Informational risk radar — never blocks payments.
 * Uses only real payment data already in the system.
 */
export async function computeRiskSignals(
  organizationId: string,
  environment: Environment
): Promise<{ level: RiskLevel; signals: RiskSignal[] }> {
  const now = new Date();
  const day7 = new Date(now.getTime() - 7 * 86400000).toISOString();
  const day14 = new Date(now.getTime() - 14 * 86400000).toISOString();
  const day30 = new Date(now.getTime() - 30 * 86400000).toISOString();

  const { data: payments } = await supabaseAdmin
    .from("payments")
    .select("amount, status, created_at")
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .gte("created_at", day30);

  const rows = payments || [];
  const signals: RiskSignal[] = [];

  const inWindow = (from: string, to?: string) =>
    rows.filter((p) => {
      const t = p.created_at as string;
      if (t < from) return false;
      if (to && t >= to) return false;
      return true;
    });

  const recent = inWindow(day7);
  const previous = inWindow(day14, day7);

  const sumSucceeded = (list: typeof rows) =>
    list
      .filter((p) => p.status === "succeeded")
      .reduce((s, p) => s + (p.amount || 0), 0);

  const countStatus = (list: typeof rows, status: string) =>
    list.filter((p) => p.status === status).length;

  const volRecent = sumSucceeded(recent);
  const volPrev = sumSucceeded(previous);

  // Volume spike (>3x previous week with meaningful base)
  if (volPrev >= 5000 && volRecent > volPrev * 3) {
    signals.push({
      level: "attention",
      indicator: "volume_spike",
      title: "Variacao incomum no volume de vendas",
      explanation: `Detectamos um aumento relevante no volume de vendas pagas nos ultimos 7 dias em relacao a semana anterior. Volume recente: ${(volRecent / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}; semana anterior: ${(volPrev / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
      detected_at: now.toISOString(),
      metrics: { volume_recent_cents: volRecent, volume_previous_cents: volPrev },
    });
  }

  // Volume drop (>70% drop with prior activity)
  if (volPrev >= 10000 && volRecent < volPrev * 0.3) {
    signals.push({
      level: "attention",
      indicator: "volume_drop",
      title: "Queda no volume de vendas",
      explanation: `O volume de vendas pagas caiu de forma acentuada nos ultimos 7 dias em comparacao com a semana anterior.`,
      detected_at: now.toISOString(),
      metrics: { volume_recent_cents: volRecent, volume_previous_cents: volPrev },
    });
  }

  // Approval rate drop
  const decidedRecent = recent.filter((p) =>
    ["succeeded", "failed", "canceled", "expired"].includes(p.status as string)
  );
  const decidedPrev = previous.filter((p) =>
    ["succeeded", "failed", "canceled", "expired"].includes(p.status as string)
  );

  if (decidedRecent.length >= 5 && decidedPrev.length >= 5) {
    const rateRecent =
      countStatus(decidedRecent, "succeeded") / decidedRecent.length;
    const ratePrev =
      countStatus(decidedPrev, "succeeded") / decidedPrev.length;
    if (ratePrev - rateRecent >= 0.25) {
      signals.push({
        level: "elevated",
        indicator: "approval_drop",
        title: "Queda na taxa de aprovacao",
        explanation: `A taxa de aprovacao nos ultimos 7 dias (${Math.round(rateRecent * 100)}%) esta bem abaixo da semana anterior (${Math.round(ratePrev * 100)}%). Isso pode indicar mudancas no mix de clientes ou problemas operacionais.`,
        detected_at: now.toISOString(),
        metrics: {
          approval_recent: Math.round(rateRecent * 1000) / 1000,
          approval_previous: Math.round(ratePrev * 1000) / 1000,
        },
      });
    }
  }

  // Cancellation increase
  const cancelRecent = countStatus(recent, "canceled") + countStatus(recent, "expired");
  const cancelPrev = countStatus(previous, "canceled") + countStatus(previous, "expired");
  if (recent.length >= 8 && cancelRecent >= 3 && cancelRecent > cancelPrev * 2) {
    signals.push({
      level: "attention",
      indicator: "cancellation_increase",
      title: "Aumento de cancelamentos e expiracoes",
      explanation: `Houve um aumento de cobrancas canceladas ou expiradas nos ultimos 7 dias (${cancelRecent}) em relacao a semana anterior (${cancelPrev}).`,
      detected_at: now.toISOString(),
      metrics: { cancel_recent: cancelRecent, cancel_previous: cancelPrev },
    });
  }

  // Refunds if any in last 30 days
  const { data: refunds } = await supabaseAdmin
    .from("refunds")
    .select("amount, status, created_at")
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .gte("created_at", day30);

  const refundSucceeded = (refunds || []).filter((r) => r.status === "succeeded");
  if (refundSucceeded.length >= 3) {
    const refundTotal = refundSucceeded.reduce((s, r) => s + (r.amount || 0), 0);
    signals.push({
      level: "attention",
      indicator: "refund_activity",
      title: "Atividade de reembolsos",
      explanation: `Foram registrados ${refundSucceeded.length} reembolso(s) nos ultimos 30 dias, totalizando ${(refundTotal / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
      detected_at: now.toISOString(),
      metrics: {
        refund_count: refundSucceeded.length,
        refund_total_cents: refundTotal,
      },
    });
  }

  let overall: RiskLevel = "normal";
  if (signals.some((s) => s.level === "elevated")) overall = "elevated";
  else if (signals.some((s) => s.level === "attention")) overall = "attention";

  if (signals.length === 0) {
    signals.push({
      level: "normal",
      indicator: "baseline",
      title: "Indicadores dentro do padrao",
      explanation:
        "Nao detectamos variacoes relevantes nos indicadores de volume, aprovacao ou cancelamentos no periodo analisado.",
      detected_at: now.toISOString(),
      metrics: {
        volume_7d_cents: volRecent,
        payments_7d: recent.length,
      },
    });
  }

  return { level: overall, signals };
}
