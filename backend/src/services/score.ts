import { supabaseAdmin } from "../config/supabase.js";
import type { Environment } from "../types/index.js";

export type ScoreLevel = "bronze" | "silver" | "gold" | "elite";

export interface FluxPayScore {
  score: number;
  level: ScoreLevel;
  level_label: string;
  factors: {
    volume_cents: number;
    payment_count: number;
    approval_rate: number;
    days_active: number;
    consistency: number;
  };
  next_level: ScoreLevel | null;
  progress_to_next: number;
  explanation: string;
}

const LEVEL_LABELS: Record<ScoreLevel, string> = {
  bronze: "Bronze",
  silver: "Prata",
  gold: "Ouro",
  elite: "Elite",
};

const LEVEL_THRESHOLDS: { level: ScoreLevel; min: number }[] = [
  { level: "elite", min: 80 },
  { level: "gold", min: 55 },
  { level: "silver", min: 30 },
  { level: "bronze", min: 0 },
];

function levelFromScore(score: number): ScoreLevel {
  for (const t of LEVEL_THRESHOLDS) {
    if (score >= t.min) return t.level;
  }
  return "bronze";
}

function nextLevel(level: ScoreLevel): ScoreLevel | null {
  if (level === "bronze") return "silver";
  if (level === "silver") return "gold";
  if (level === "gold") return "elite";
  return null;
}

function progressToNext(score: number, level: ScoreLevel): number {
  const nxt = nextLevel(level);
  if (!nxt) return 100;
  const currentMin = LEVEL_THRESHOLDS.find((t) => t.level === level)?.min ?? 0;
  const nextMin = LEVEL_THRESHOLDS.find((t) => t.level === nxt)?.min ?? 100;
  const span = nextMin - currentMin;
  if (span <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round(((score - currentMin) / span) * 100)));
}

/**
 * FluxPay Score — calculated only from real platform data.
 * Never user-editable. Never invents metrics.
 */
export async function computeFluxPayScore(
  organizationId: string,
  environment: Environment = "live"
): Promise<FluxPayScore> {
  const { data: payments } = await supabaseAdmin
    .from("payments")
    .select("amount, status, created_at")
    .eq("organization_id", organizationId)
    .eq("environment", environment);

  const rows = payments || [];
  const succeeded = rows.filter((p) => p.status === "succeeded");
  const failedLike = rows.filter((p) =>
    ["failed", "canceled", "expired"].includes(p.status as string)
  );
  const decided = succeeded.length + failedLike.length;

  const volumeCents = succeeded.reduce((s, p) => s + (p.amount || 0), 0);
  const paymentCount = succeeded.length;
  const approvalRate = decided > 0 ? succeeded.length / decided : 0;

  let firstAt: Date | null = null;
  let lastAt: Date | null = null;
  for (const p of succeeded) {
    const d = new Date(p.created_at as string);
    if (!firstAt || d < firstAt) firstAt = d;
    if (!lastAt || d > lastAt) lastAt = d;
  }

  const daysActive =
    firstAt && lastAt
      ? Math.max(1, Math.ceil((lastAt.getTime() - firstAt.getTime()) / 86400000) + 1)
      : firstAt
        ? 1
        : 0;

  // Consistency: payments spread across weeks (0–1)
  let consistency = 0;
  if (paymentCount >= 2 && firstAt && lastAt) {
    const weeks = Math.max(1, daysActive / 7);
    const density = paymentCount / weeks;
    consistency = Math.min(1, density / 3);
  } else if (paymentCount === 1) {
    consistency = 0.15;
  }

  // Volume score 0–40 (log scale up to R$ 100k)
  const volumeScore =
    volumeCents <= 0
      ? 0
      : Math.min(40, (Math.log10(volumeCents / 100 + 1) / Math.log10(100001)) * 40);

  // Count score 0–25
  const countScore = Math.min(25, (Math.log10(paymentCount + 1) / Math.log10(501)) * 25);

  // Approval 0–20
  const approvalScore = approvalRate * 20;

  // Tenure 0–10 (up to ~180 days)
  const tenureScore = Math.min(10, (daysActive / 180) * 10);

  // Consistency 0–5
  const consistencyScore = consistency * 5;

  const raw =
    volumeScore + countScore + approvalScore + tenureScore + consistencyScore;
  const score = Math.round(Math.min(100, Math.max(0, raw)));
  const level = levelFromScore(score);

  const explanation =
    paymentCount === 0
      ? "O Score evolui com vendas pagas reais na FluxPay. Ainda nao ha vendas succeeded neste ambiente."
      : `Calculado a partir de ${paymentCount} venda(s) paga(s), volume de ${(volumeCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}, taxa de aprovacao de ${Math.round(approvalRate * 100)}% e ${daysActive} dia(s) de atividade.`;

  return {
    score,
    level,
    level_label: LEVEL_LABELS[level],
    factors: {
      volume_cents: volumeCents,
      payment_count: paymentCount,
      approval_rate: Math.round(approvalRate * 1000) / 1000,
      days_active: daysActive,
      consistency: Math.round(consistency * 1000) / 1000,
    },
    next_level: nextLevel(level),
    progress_to_next: progressToNext(score, level),
    explanation,
  };
}

export { LEVEL_LABELS };
