/**
 * MongoDB Atlas — dados auxiliares (Score cache, Ranking, Perfil Público).
 *
 * FONTE DE VERDADE:
 *   MongoDB (quando MONGODB_URI configurada):
 *     - ranking_participants: metadados ADM (display_name, avatar, is_active, org ref)
 *     - org_scores: cache do FluxPay Score (resultado calculado; NÃO fonte financeira)
 *     - public_profiles: dados públicos (slug, bio, work, avatar, enabled)
 *   Supabase (sempre):
 *     - payments / balance_transactions / ledger / saldo / PIX financeiro
 *     - volume do ranking de org = SUM(payments.amount) status=succeeded env=live
 *     - cálculo do Score = computeFluxPayScore sobre payments
 *
 * NUNCA usar Mongo para saldo, ledger, payments ou valores financeiros.
 *
 * Disponibilidade:
 *   - MONGODB_URI ausente → ranking/perfil/score-cache usam fallback documentado
 *   - MONGODB_URI presente e OK → Mongo é store principal auxiliar
 *   - MONGODB_URI presente e FALHA → 503 explícito (sem fallback silencioso)
 */

import { MongoClient, type Db, type ObjectId } from "mongodb";
import { AppError } from "../middleware/error.js";

let client: MongoClient | null = null;
let db: Db | null = null;
let ready = false;
let connectionFailed = false;
let lastErrorMessage: string | null = null;
let connectPromise: Promise<Db | null> | null = null;

export function isMongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI && process.env.MONGODB_URI.trim());
}

export function getMongoStatus(): {
  configured: boolean;
  ready: boolean;
  connectionFailed: boolean;
  error: string | null;
  database: string;
} {
  return {
    configured: isMongoConfigured(),
    ready,
    connectionFailed,
    error: lastErrorMessage,
    database: (process.env.MONGODB_DB || "fluxpay").trim(),
  };
}

export async function ensureMongoIndexes(database: Db): Promise<void> {
  const ranking = database.collection("ranking_participants");
  await ranking.createIndexes([
    { key: { id: 1 }, name: "uq_id", unique: true },
    { key: { organization_id: 1, is_active: 1 }, name: "org_active" },
    { key: { is_active: 1, created_at: 1 }, name: "active_created" },
    {
      key: { organization_id: 1 },
      name: "uq_org_active",
      unique: true,
      partialFilterExpression: {
        organization_id: { $type: "string" },
        is_active: true,
      },
    },
  ]);

  const scores = database.collection("org_scores");
  await scores.createIndexes([
    {
      key: { organization_id: 1, environment: 1 },
      name: "uq_org_env",
      unique: true,
    },
    { key: { calculated_at: 1 }, name: "calculated_at" },
  ]);

  const profiles = database.collection("public_profiles");
  await profiles.createIndexes([
    { key: { organization_id: 1 }, name: "uq_organization_id", unique: true },
    { key: { slug: 1 }, name: "uq_slug", unique: true },
    { key: { enabled: 1, slug: 1 }, name: "enabled_slug" },
  ]);
}

/** @deprecated use ensureMongoIndexes */
export async function ensureRankingIndexes(database: Db): Promise<void> {
  await ensureMongoIndexes(database);
}

async function connectOnce(): Promise<Db | null> {
  if (!isMongoConfigured()) {
    return null;
  }

  if (ready && db) return db;

  const uri = process.env.MONGODB_URI!.trim();
  const dbName = (process.env.MONGODB_DB || "fluxpay").trim();
  const hostHint = uri.includes("@") ? uri.split("@").pop()?.split("/")[0] : "(host)";

  try {
    const next = new MongoClient(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 8000,
    });
    await next.connect();
    const nextDb = next.db(dbName);
    await ensureMongoIndexes(nextDb);

    client = next;
    db = nextDb;
    ready = true;
    connectionFailed = false;
    lastErrorMessage = null;
    console.log(`[mongo] connected db=${dbName} host=${hostHint}`);
    return db;
  } catch (err) {
    connectionFailed = true;
    lastErrorMessage = (err as Error).message || "MongoDB connection failed";
    console.error(`[mongo] connection failed db=${dbName}:`, lastErrorMessage);
    client = null;
    db = null;
    ready = false;
    throw new AppError(
      503,
      "service_unavailable",
      "MongoDB configurado (MONGODB_URI) mas indisponivel. Score cache, Ranking e Perfil Publico nao podem ser servidos ate a conexao ser restabelecida."
    );
  }
}

export async function getMongoDb(): Promise<Db | null> {
  if (!isMongoConfigured()) return null;

  if (ready && db) return db;

  if (!connectPromise) {
    connectPromise = connectOnce().finally(() => {
      connectPromise = null;
    });
  }
  return connectPromise;
}

export async function requireMongoDb(): Promise<Db> {
  const database = await getMongoDb();
  if (!database) {
    throw new AppError(
      503,
      "service_unavailable",
      "MongoDB nao configurado. Defina MONGODB_URI e MONGODB_DB no backend."
    );
  }
  return database;
}

export type RankingParticipantDoc = {
  _id?: ObjectId;
  id: string;
  organization_id: string | null;
  display_name: string;
  avatar_url: string | null;
  manual_amount_cents: number | null;
  score_override: number | null;
  is_active: boolean;
  sort_priority: number;
  season_id?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Cache auxiliar do Score — NUNCA fonte financeira. Recalcular de payments. */
export type OrgScoreDoc = {
  _id?: ObjectId;
  organization_id: string;
  environment: string;
  score: number;
  level: string;
  level_label: string;
  factors: {
    volume_cents: number;
    payment_count: number;
    approval_rate: number;
    days_active: number;
    consistency: number;
  };
  next_level: string | null;
  progress_to_next: number;
  explanation: string;
  calculated_at: string;
  updated_at: string;
};

/** Dados públicos do perfil — sem valores financeiros como verdade. */
export type PublicProfileDoc = {
  _id?: ObjectId;
  organization_id: string;
  slug: string;
  display_name: string | null;
  bio: string | null;
  work: string | null;
  avatar_url: string | null;
  enabled: boolean;
  /** member_since derivado da org no Supabase no seed; não é dado financeiro */
  member_since: string | null;
  created_at: string;
  updated_at: string;
};
