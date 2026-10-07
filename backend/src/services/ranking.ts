import { supabaseAdmin } from "../config/supabase.js";
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
 * Deterministic tie-break: higher amount → higher score → older created_at → id ASC.
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

export async function getRankingBoard(limit = 50): Promise<RankingEntry[]> {
  // Active org-linked participants + manual participants
  const { data: participants, error } = await supabaseAdmin
    .from("ranking_participants")
    .select(
      "id, organization_id, display_name, avatar_url, manual_amount_cents, score_override, is_active, created_at, sort_priority"
    )
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    throw new AppError(500, "api_error", "Nao foi possivel carregar o ranking.");
  }

  const rows = participants || [];
  const orgIds = [
    ...new Set(
      rows.map((r) => r.organization_id).filter(Boolean) as string[]
    ),
  ];

  // Also include active organizations that have succeeded live payments even if not manually added,
  // but only if they are already in ranking_participants OR we auto-include top sellers.
  // Spec: ADM selects participants. So we only use ranking_participants table.

  const volumeMap = new Map<string, number>();
  const scoreMap = new Map<string, FluxPayScore>();

  if (orgIds.length > 0) {
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
    const scoreData = isOrg
      ? scoreMap.get(r.organization_id as string)
      : null;
    const score =
      typeof r.score_override === "number"
        ? r.score_override
        : scoreData?.score ?? 0;

    return {
      id: r.id as string,
      organization_id: (r.organization_id as string) || null,
      display_name: r.display_name as string,
      avatar_url: (r.avatar_url as string) || null,
      amount_cents: amount,
      score,
      score_level: scoreData?.level ?? "bronze",
      score_level_label: scoreData?.level_label ?? "Bronze",
      source: isOrg ? ("organization" as const) : ("manual" as const),
      is_active: true,
      created_at: r.created_at as string,
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
    // Ensure org exists
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, name, logo_url")
      .eq("id", input.organization_id)
      .maybeSingle();
    if (!org) {
      throw new AppError(404, "not_found", "Organizacao nao encontrada.");
    }
  }

  const payload: Record<string, unknown> = {
    display_name: name,
    avatar_url: input.avatar_url ?? null,
    organization_id: input.organization_id ?? null,
    manual_amount_cents:
      input.organization_id != null
        ? null
        : input.manual_amount_cents ?? 0,
    score_override: input.score_override ?? null,
    is_active: input.is_active ?? true,
    updated_at: new Date().toISOString(),
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
      throw new AppError(
        409,
        "invalid_request",
        "Esta organizacao ja esta no ranking."
      );
    }
    throw new AppError(500, "api_error", error.message);
  }
  return data;
}

export async function removeRankingParticipant(id: string) {
  const { error } = await supabaseAdmin
    .from("ranking_participants")
    .delete()
    .eq("id", id);
  if (error) throw new AppError(500, "api_error", error.message);
  return { id, deleted: true };
}
