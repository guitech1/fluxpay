import { supabaseAdmin } from "../config/supabase.js";
import { getMongoDb, type OrgScoreDoc } from "../config/mongo.js";
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

/** Cache auxiliar válido por 5 minutos. Sempre recalcula a partir de payments se expirado/ausente. */
const SCORE_CACHE_TTL_MS = 5 * 60 * 1000;

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

function docToScore(doc: OrgScoreDoc): FluxPayScore {
  return {
    score: doc.score,
    level: doc.level as ScoreLevel,
    level_label: doc.level_label,
    factors: { ...doc.factors },
    next_level: (doc.next_level as ScoreLevel | null) ?? null,
    progress_to_next: doc.progress_to_next,
    explanation: doc.explanation,
  };
}

/**
 * Calcula Score SOMENTE a partir de payments no Supabase.
 * Nunca usa valor do frontend. Nunca usa score_override do Ranking.
 */
async function calculateFromPayments(
  organizationId: string,
  environment: Environment
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

  let consistency = 0;
  if (paymentCount >= 2 && firstAt && lastAt) {
    const weeks = Math.max(1, daysActive / 7);
    const density = paymentCount / weeks;
    consistency = Math.min(1, density / 3);
  } else if (paymentCount === 1) {
    consistency = 0.15;
  }

  const volumeScore =
    volumeCents <= 0
      ? 0
      : Math.min(40, (Math.log10(volumeCents / 100 + 1) / Math.log10(100001)) * 40);
  const countScore = Math.min(25, (Math.log10(paymentCount + 1) / Math.log10(501)) * 25);
  const approvalScore = approvalRate * 20;
  const tenureScore = Math.min(10, (daysActive / 180) * 10);
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

async function persistScoreCache(
  organizationId: string,
  environment: Environment,
  result: FluxPayScore
): Promise<void> {
  try {
    const mongo = await getMongoDb();
    if (!mongo) return;
    const now = new Date().toISOString();
    const col = mongo.collection<OrgScoreDoc>("org_scores");
    await col.updateOne(
      { organization_id: organizationId, environment },
      {
        $set: {
          organization_id: organizationId,
          environment,
          score: result.score,
          level: result.level,
          level_label: result.level_label,
          factors: result.factors,
          next_level: result.next_level,
          progress_to_next: result.progress_to_next,
          explanation: result.explanation,
          calculated_at: now,
          updated_at: now,
        },
      },
      { upsert: true }
    );
  } catch {
    // Cache é auxiliar — falha de escrita não quebra o Score
  }
}

async function readScoreCache(
  organizationId: string,
  environment: Environment
): Promise<FluxPayScore | null> {
  try {
    const mongo = await getMongoDb();
    if (!mongo) return null;
    const doc = await mongo.collection<OrgScoreDoc>("org_scores").findOne({
      organization_id: organizationId,
      environment,
    });
    if (!doc?.calculated_at) return null;
    const age = Date.now() - new Date(doc.calculated_at).getTime();
    if (age > SCORE_CACHE_TTL_MS || age < 0) return null;
    return docToScore(doc);
  } catch {
    return null;
  }
}

/**
 * FluxPay Score — calculado apenas de payments reais (Supabase).
 * Persistência auxiliar em Mongo org_scores (cache). Nunca editável pelo usuário.
 * score_override do Ranking NÃO é o Score oficial.
 */
export async function computeFluxPayScore(
  organizationId: string,
  environment: Environment = "live"
): Promise<FluxPayScore> {
  const cached = await readScoreCache(organizationId, environment);
  if (cached) return cached;

  const result = await calculateFromPayments(organizationId, environment);
  await persistScoreCache(organizationId, environment, result);
  return result;
}

/** Força recálculo a partir de payments e atualiza o cache Mongo. */
export async function recalculateFluxPayScore(
  organizationId: string,
  environment: Environment = "live"
): Promise<FluxPayScore> {
  const result = await calculateFromPayments(organizationId, environment);
  await persistScoreCache(organizationId, environment, result);
  return result;
}

export { LEVEL_LABELS };
