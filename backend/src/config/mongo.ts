/**
 * MongoDB Atlas — dados auxiliares (Ranking).
 *
 * FONTE DE VERDADE:
 *   MongoDB (quando MONGODB_URI configurada):
 *     - ranking_participants: display_name, avatar_url, is_active,
 *       organization_id (ref), manual_amount_cents (só sem org), metadados ADM
 *   Supabase (sempre):
 *     - payments / balance_transactions / ledger / saldo / PIX financeiro
 *     - volume do ranking de org = SUM(payments.amount) status=succeeded env=live
 *     - FluxPay Score = computeFluxPayScore (payments)
 *     - perfil público (bio, work, slug) = organizations
 *
 * NUNCA usar Mongo para saldo, ledger, payments ou Score oficial.
 *
 * Comportamento de disponibilidade:
 *   - MONGODB_URI ausente → store Supabase (Mongo não configurado)
 *   - MONGODB_URI presente e conexão OK → Mongo é a store de ranking_participants
 *   - MONGODB_URI presente e conexão FALHA → erro explícito (503), sem fallback silencioso
 */

import { MongoClient, type Db, type ObjectId } from "mongodb";
import { AppError } from "../middleware/error.js";

let client: MongoClient | null = null;
let db: Db | null = null;
/** true após tentativa bem-sucedida de connect+indexes */
let ready = false;
/** true se URI definida e a última tentativa de conexão falhou */
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

/**
 * Garante índices alinhados ao Atlas + código.
 * uq_org_active: unique parcial — no máximo um participante ATIVO por organization_id;
 * vários docs com organization_id=null são permitidos.
 */
export async function ensureRankingIndexes(database: Db): Promise<void> {
  const col = database.collection("ranking_participants");

  await col.createIndexes([
    { key: { id: 1 }, name: "uq_id", unique: true },
    { key: { organization_id: 1, is_active: 1 }, name: "org_active" },
    { key: { is_active: 1, created_at: 1 }, name: "active_created" },
    {
      key: { organization_id: 1 },
      name: "uq_org_active",
      unique: true,
      // Só documentos com organization_id string e is_active true
      partialFilterExpression: {
        organization_id: { $type: "string" },
        is_active: true,
      },
    },
  ]);
}

async function connectOnce(): Promise<Db | null> {
  if (!isMongoConfigured()) {
    return null;
  }

  if (ready && db) return db;

  const uri = process.env.MONGODB_URI!.trim();
  const dbName = (process.env.MONGODB_DB || "fluxpay").trim();

  // Nunca logar a URI completa (contém senha)
  const hostHint = uri.includes("@") ? uri.split("@").pop()?.split("/")[0] : "(host)";

  try {
    const next = new MongoClient(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 8000,
    });
    await next.connect();
    const nextDb = next.db(dbName);
    await ensureRankingIndexes(nextDb);

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
    // Mensagem sem URI/senha
    console.error(`[mongo] connection failed db=${dbName}:`, lastErrorMessage);
    client = null;
    db = null;
    ready = false;
    throw new AppError(
      503,
      "service_unavailable",
      "MongoDB configurado (MONGODB_URI) mas indisponivel. Ranking nao pode ser servido ate a conexao ser restabelecida."
    );
  }
}

/**
 * Retorna Db quando Mongo está configurado e online.
 * Retorna null quando MONGODB_URI não está definida (store Supabase).
 * Lança AppError 503 quando URI está definida mas a conexão falhou.
 */
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

/**
 * Exige Mongo online. Use nas rotas de ranking quando a store ativa é Mongo.
 */
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
  /** Mongo ObjectId — opcional no insert (driver gera). Nunca use unknown. */
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
