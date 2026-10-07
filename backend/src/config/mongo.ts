/**
 * MongoDB Atlas — opcional.
 *
 * Uso permitido neste projeto:
 *   - ranking_participants (metadados de participantes)
 *   - public_profiles (bio, avatar, work — nao financeiro)
 *   - labs_experiments (experimentos isolados)
 *
 * NUNCA usar para saldo, ledger, payments ou balance_transactions.
 * Volume e Score sempre calculados a partir do Supabase (payments succeeded).
 *
 * Se MONGODB_URI nao estiver definida, getDb() devolve null e os services
 * usam as tabelas Supabase da migration 021.
 */

import { MongoClient, type Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;
let connectAttempted = false;

export function isMongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI && process.env.MONGODB_URI.trim());
}

export async function getMongoDb(): Promise<Db | null> {
  if (!isMongoConfigured()) return null;

  if (db) return db;
  if (connectAttempted && !db) return null;

  connectAttempted = true;
  const uri = process.env.MONGODB_URI!.trim();
  const dbName = (process.env.MONGODB_DB || "fluxpay").trim();

  try {
    client = new MongoClient(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    db = client.db(dbName);

    // Indices idempotentes para ranking e perfil
    await db.collection("ranking_participants").createIndexes([
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

    await db.collection("public_profiles").createIndexes([
      { key: { slug: 1 }, name: "uq_slug", unique: true },
      { key: { organization_id: 1 }, name: "uq_org", unique: true },
      { key: { public_profile_enabled: 1 }, name: "enabled" },
    ]);

    console.log(`[mongo] connected db=${dbName}`);
    return db;
  } catch (err) {
    console.error("[mongo] connection failed — falling back to Supabase store:", (err as Error).message);
    client = null;
    db = null;
    return null;
  }
}

export type RankingParticipantDoc = {
  _id?: string;
  id: string;
  organization_id: string | null;
  display_name: string;
  avatar_url: string | null;
  manual_amount_cents: number | null;
  score_override: number | null;
  is_active: boolean;
  sort_priority: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicProfileDoc = {
  _id?: string;
  organization_id: string;
  slug: string;
  display_name: string;
  bio: string | null;
  work: string | null;
  avatar_url: string | null;
  public_profile_enabled: boolean;
  updated_at: string;
};
