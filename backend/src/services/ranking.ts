import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { getMongoDb, isMongoConfigured, type RankingParticipantDoc } from "../config/mongo.js";
import { AppError } from "../middleware/error.js";
import { computeFluxPayScore, type FluxPayScore } from "./score.js";

export interface RankingEntry {
  position: number;
  id: string;
  organization_id: string | null;
  display_name: string;
  avatar_url: string | null;
  amount_cents: number;
  score: number;
  score_level: string;
  score_level_label: string;
  source: "organization" | "manual";
  is_active: boolean;
}

/**
 * Fonte de verdade por campo:
 * - amount_cents (org): Supabase payments succeeded + live
 * - amount_cents (manual): Mongo/Supabase manual_amount_cents (ADM)
 * - score: computeFluxPayScore (Supabase payments) salvo score_override ADM
 * - display_name / is_active / organization_id: store de participantes (Mongo se configurado)
 */

function compareEntries(
  a: { amount_cents: number; score: number; created_at: string; id: string },
  b: { amount_cents: number; score: number; created_at: string; id: string }
): number {
  if (b.amount_cents !== a.amount_cents) return b.amount_cents - a.amount_cents;
  if (b.score !== a.score) return b.score - a.score;
  const ta = new Date(a.created_at).getTime();
  const tb = new Date(b.created_at).getTime();
  if (ta !== tb) return ta - tb;
  return a.id.localeCompare(b.id);
}

type ParticipantRow = {
  id: string;
  organization_id: string | null;
  display_name: string;
  avatar_url: string | null;
  manual_amount_cents: number | null;
  score_override: number | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  sort_priority?: number;
};

async function loadParticipantsActive(): Promise<ParticipantRow[]> {
  // getMongoDb: null = não configurado; throw 503 = configurado e offline
  const mongo = await getMongoDb();

  if (mongo) {
    const docs = await mongo
      .collection<RankingParticipantDoc>("ranking_participants")
      .find({ is_active: true })
      .sort({ created_at: 1 })
      .toArray();
    return docs.map((d) => ({
      id: d.id,
      organization_id: d.organization_id,
      display_name: d.display_name,
      avatar_url: d.avatar_url,
      manual_amount_cents: d.manual_amount_cents,
      score_override: d.score_override,
      is_active: d.is_active,
      created_at: d.created_at,
    }));
  }

  const { data, error } = await supabaseAdmin
    .from("ranking_participants")
    .select(
      "id, organization_id, display_name, avatar_url, manual_amount_cents, score_override, is_active, created_at, sort_priority"
    )
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    throw new AppError(500, "api_error", "Nao foi possivel carregar o ranking.");
  }
  return (data || []) as ParticipantRow[];
}

export async function getRankingBoard(limit = 50): Promise<RankingEntry[]> {
  const rows = await loadParticipantsActive();
  const orgIds = [
    ...new Set(rows.map((r) => r.organization_id).filter(Boolean) as string[]),
  ];

  const volumeMap = new Map<string, number>();
  const scoreMap = new Map<string, FluxPayScore>();

  if (orgIds.length > 0) {
    // Somente succeeded + live — nunca pending/canceled/expired/failed
    const { data: payments } = await supabaseAdmin
      .from("payments")
      .select("organization_id, amount")
      .in("organization_id", orgIds)
      .eq("environment", "live")
      .eq("status", "succeeded");

    for (const p of payments || []) {
      const oid = p.organization_id as string;
      volumeMap.set(oid, (volumeMap.get(oid) || 0) + (p.amount || 0));
    }

    await Promise.all(
      orgIds.map(async (oid) => {
        scoreMap.set(oid, await computeFluxPayScore(oid, "live"));
      })
    );
  }

  const draft = rows.map((r) => {
    const isOrg = !!r.organization_id;
    const amount = isOrg
      ? volumeMap.get(r.organization_id as string) || 0
      : r.manual_amount_cents || 0;
    const scoreData = isOrg ? scoreMap.get(r.organization_id as string) : null;
    const score =
      typeof r.score_override === "number"
        ? r.score_override
        : scoreData?.score ?? 0;

    return {
      id: r.id,
      organization_id: r.organization_id,
      display_name: r.display_name,
      avatar_url: r.avatar_url,
      amount_cents: amount,
      score,
      score_level: scoreData?.level ?? "bronze",
      score_level_label: scoreData?.level_label ?? "Bronze",
      source: isOrg ? ("organization" as const) : ("manual" as const),
      is_active: true,
      created_at: r.created_at,
    };
  });

  draft.sort(compareEntries);

  return draft.slice(0, Math.min(Math.max(limit, 1), 100)).map((e, i) => ({
    position: i + 1,
    id: e.id,
    organization_id: e.organization_id,
    display_name: e.display_name,
    avatar_url: e.avatar_url,
    amount_cents: e.amount_cents,
    score: e.score,
    score_level: e.score_level,
    score_level_label: e.score_level_label,
    source: e.source,
    is_active: e.is_active,
  }));
}

export async function listRankingParticipantsAdmin() {
  const mongo = await getMongoDb();
  if (mongo) {
    const docs = await mongo
      .collection<RankingParticipantDoc>("ranking_participants")
      .find({})
      .sort({ created_at: -1 })
      .toArray();
    return docs.map((d) => ({
      id: d.id,
      organization_id: d.organization_id,
      display_name: d.display_name,
      avatar_url: d.avatar_url,
      manual_amount_cents: d.manual_amount_cents,
      score_override: d.score_override,
      is_active: d.is_active,
      created_at: d.created_at,
      updated_at: d.updated_at,
      sort_priority: d.sort_priority,
    }));
  }

  const { data, error } = await supabaseAdmin
    .from("ranking_participants")
    .select(
      "id, organization_id, display_name, avatar_url, manual_amount_cents, score_override, is_active, created_at, updated_at, sort_priority"
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new AppError(500, "api_error", "Nao foi possivel listar participantes.");
  }
  return data || [];
}

export async function getRankingParticipantById(id: string): Promise<ParticipantRow | null> {
  const mongo = await getMongoDb();
  if (mongo) {
    const doc = await mongo.collection<RankingParticipantDoc>("ranking_participants").findOne({ id });
    if (!doc) return null;
    return {
      id: doc.id,
      organization_id: doc.organization_id,
      display_name: doc.display_name,
      avatar_url: doc.avatar_url,
      manual_amount_cents: doc.manual_amount_cents,
      score_override: doc.score_override,
      is_active: doc.is_active,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
    };
  }

  const { data } = await supabaseAdmin
    .from("ranking_participants")
    .select(
      "id, organization_id, display_name, avatar_url, manual_amount_cents, score_override, is_active, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();
  return (data as ParticipantRow) || null;
}

export async function upsertRankingParticipant(input: {
  id?: string;
  organization_id?: string | null;
  display_name: string;
  avatar_url?: string | null;
  manual_amount_cents?: number | null;
  score_override?: number | null;
  is_active?: boolean;
  created_by?: string;
}) {
  const name = input.display_name.trim();
  if (name.length < 2) {
    throw new AppError(400, "validation_error", "Informe um nome com pelo menos 2 caracteres.");
  }

  if (input.organization_id) {
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, name, logo_url")
      .eq("id", input.organization_id)
      .maybeSingle();
    if (!org) {
      throw new AppError(404, "not_found", "Organizacao nao encontrada.");
    }
  }

  const now = new Date().toISOString();
  const mongo = await getMongoDb();

  if (mongo) {
    const col = mongo.collection<RankingParticipantDoc>("ranking_participants");

    if (input.id) {
      const update: Partial<RankingParticipantDoc> = {
        display_name: name,
        avatar_url: input.avatar_url ?? null,
        organization_id: input.organization_id ?? null,
        manual_amount_cents:
          input.organization_id != null ? null : input.manual_amount_cents ?? 0,
        score_override: input.score_override ?? null,
        is_active: input.is_active ?? true,
        updated_at: now,
      };
      const result = await col.findOneAndUpdate(
        { id: input.id },
        { $set: update },
        { returnDocument: "after" }
      );
      if (!result) throw new AppError(404, "not_found", "Participante nao encontrado.");
      return result;
    }

    if (input.organization_id) {
      const existing = await col.findOne({
        organization_id: input.organization_id,
        is_active: true,
      });
      if (existing) {
        throw new AppError(409, "invalid_request", "Esta organizacao ja esta no ranking.");
      }
    }

    const doc: RankingParticipantDoc = {
      id: randomUUID(),
      display_name: name,
      avatar_url: input.avatar_url ?? null,
      organization_id: input.organization_id ?? null,
      manual_amount_cents:
        input.organization_id != null ? null : input.manual_amount_cents ?? 0,
      score_override: input.score_override ?? null,
      is_active: input.is_active ?? true,
      sort_priority: 0,
      created_by: input.created_by ?? null,
      created_at: now,
      updated_at: now,
    };
    try {
      await col.insertOne(doc);
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        throw new AppError(409, "invalid_request", "Esta organizacao ja esta no ranking.");
      }
      throw err;
    }
    return doc;
  }

  // Store Supabase (Mongo nao configurado)
  if (isMongoConfigured()) {
    // URI definida mas getMongoDb deveria ter lancado — defesa em profundidade
    throw new AppError(503, "service_unavailable", "MongoDB indisponivel.");
  }

  const payload: Record<string, unknown> = {
    display_name: name,
    avatar_url: input.avatar_url ?? null,
    organization_id: input.organization_id ?? null,
    manual_amount_cents:
      input.organization_id != null ? null : input.manual_amount_cents ?? 0,
    score_override: input.score_override ?? null,
    is_active: input.is_active ?? true,
    updated_at: now,
  };

  if (input.id) {
    const { data, error } = await supabaseAdmin
      .from("ranking_participants")
      .update(payload)
      .eq("id", input.id)
      .select()
      .single();
    if (error) throw new AppError(500, "api_error", error.message);
    return data;
  }

  payload.created_by = input.created_by ?? null;
  const { data, error } = await supabaseAdmin
    .from("ranking_participants")
    .insert(payload)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new AppError(409, "invalid_request", "Esta organizacao ja esta no ranking.");
    }
    throw new AppError(500, "api_error", error.message);
  }
  return data;
}

export async function removeRankingParticipant(id: string) {
  const mongo = await getMongoDb();
  if (mongo) {
    const result = await mongo.collection("ranking_participants").deleteOne({ id });
    if (result.deletedCount === 0) {
      throw new AppError(404, "not_found", "Participante nao encontrado.");
    }
    return { id, deleted: true };
  }

  const { error } = await supabaseAdmin.from("ranking_participants").delete().eq("id", id);
  if (error) throw new AppError(500, "api_error", error.message);
  return { id, deleted: true };
}
