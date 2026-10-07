import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";
import { computeFluxPayScore } from "./score.js";
import { getRankingBoard } from "./ranking.js";

const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;

export function validateSlug(slug: string): string {
  const s = slug.trim().toLowerCase();
  if (!SLUG_RE.test(s)) {
    throw new AppError(
      400,
      "validation_error",
      "Slug invalido. Use letras minusculas, numeros e hifens (3–64 caracteres)."
    );
  }
  if (s.length < 3) {
    throw new AppError(400, "validation_error", "Slug deve ter pelo menos 3 caracteres.");
  }
  const reserved = new Set([
    "admin",
    "api",
    "dashboard",
    "docs",
    "login",
    "signup",
    "checkout",
    "u",
    "ranking",
    "labs",
    "support",
    "www",
    "app",
    "static",
    "assets",
  ]);
  if (reserved.has(s)) {
    throw new AppError(400, "validation_error", "Este slug e reservado.");
  }
  return s;
}

export async function getPublicProfile(slug: string) {
  const normalized = slug.trim().toLowerCase();
  const { data: orgs, error } = await supabaseAdmin.rpc("get_public_seller_profile", {
    p_slug: normalized,
  });

  if (error) {
    // Fallback if RPC not applied yet
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select(
        "id, slug, name, public_display_name, public_bio, public_work, public_avatar_url, logo_url, created_at, public_profile_enabled, status"
      )
      .eq("slug", normalized)
      .eq("public_profile_enabled", true)
      .eq("status", "active")
      .maybeSingle();

    if (!org) {
      throw new AppError(404, "not_found", "Perfil nao encontrado.");
    }

    return buildPublicPayload(org);
  }

  const row = Array.isArray(orgs) ? orgs[0] : orgs;
  if (!row) {
    throw new AppError(404, "not_found", "Perfil nao encontrado.");
  }

  return buildPublicPayload({
    id: row.id,
    slug: row.slug,
    name: row.display_name,
    public_display_name: row.display_name,
    public_bio: row.bio,
    public_work: row.work,
    public_avatar_url: row.avatar_url,
    logo_url: row.avatar_url,
    created_at: row.created_at,
  });
}

async function buildPublicPayload(org: {
  id: string;
  slug: string;
  name?: string;
  public_display_name?: string | null;
  public_bio?: string | null;
  public_work?: string | null;
  public_avatar_url?: string | null;
  logo_url?: string | null;
  created_at: string;
}) {
  const { data: stats } = await supabaseAdmin.rpc("get_org_succeeded_sales_stats", {
    p_organization_id: org.id,
    p_environment: "live",
  });

  let totalSold = 0;
  let paymentCount = 0;
  if (Array.isArray(stats) && stats[0]) {
    totalSold = Number(stats[0].total_amount_cents) || 0;
    paymentCount = Number(stats[0].payment_count) || 0;
  } else {
    // Fallback direct query
    const { data: payments } = await supabaseAdmin
      .from("payments")
      .select("amount")
      .eq("organization_id", org.id)
      .eq("environment", "live")
      .eq("status", "succeeded");
    for (const p of payments || []) {
      totalSold += p.amount || 0;
      paymentCount += 1;
    }
  }

  const score = await computeFluxPayScore(org.id, "live");

  let rankingPosition: number | null = null;
  try {
    const board = await getRankingBoard(100);
    const found = board.find((e) => e.organization_id === org.id);
    if (found) rankingPosition = found.position;
  } catch {
    // ranking optional
  }

  return {
    slug: org.slug,
    display_name:
      (org.public_display_name && org.public_display_name.trim()) ||
      org.name ||
      "Vendedor FluxPay",
    bio: org.public_bio || null,
    work: org.public_work || null,
    avatar_url: org.public_avatar_url || org.logo_url || null,
    total_sold_cents: totalSold,
    payment_count: paymentCount,
    score: score.score,
    score_level: score.level,
    score_level_label: score.level_label,
    ranking_position: rankingPosition,
    member_since: org.created_at,
  };
}

export async function updatePublicProfile(
  organizationId: string,
  input: {
    public_display_name?: string;
    public_bio?: string;
    public_work?: string;
    public_avatar_url?: string | null;
    public_profile_enabled?: boolean;
    slug?: string;
  }
) {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.public_display_name !== undefined) {
    updates.public_display_name = input.public_display_name.trim().slice(0, 80) || null;
  }
  if (input.public_bio !== undefined) {
    updates.public_bio = input.public_bio.trim().slice(0, 500) || null;
  }
  if (input.public_work !== undefined) {
    updates.public_work = input.public_work.trim().slice(0, 120) || null;
  }
  if (input.public_avatar_url !== undefined) {
    const url = input.public_avatar_url;
    if (url && !/^https?:\/\//i.test(url)) {
      throw new AppError(400, "validation_error", "URL da foto invalida.");
    }
    updates.public_avatar_url = url;
  }
  if (input.public_profile_enabled !== undefined) {
    updates.public_profile_enabled = input.public_profile_enabled;
  }
  if (input.slug !== undefined) {
    const slug = validateSlug(input.slug);
    const { data: existing } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .neq("id", organizationId)
      .maybeSingle();
    if (existing) {
      throw new AppError(409, "invalid_request", "Este slug ja esta em uso.");
    }
    updates.slug = slug;
  }

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .update(updates)
    .eq("id", organizationId)
    .select(
      "id, slug, name, public_display_name, public_bio, public_work, public_avatar_url, public_profile_enabled, logo_url"
    )
    .single();

  if (error) throw new AppError(500, "api_error", error.message);
  return data;
}

export async function getOwnProfileSettings(organizationId: string) {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select(
      "id, slug, name, public_display_name, public_bio, public_work, public_avatar_url, public_profile_enabled, logo_url"
    )
    .eq("id", organizationId)
    .single();

  if (error || !data) {
    throw new AppError(404, "not_found", "Organizacao nao encontrada.");
  }

  const score = await computeFluxPayScore(organizationId, "live");
  const { data: payments } = await supabaseAdmin
    .from("payments")
    .select("amount")
    .eq("organization_id", organizationId)
    .eq("environment", "live")
    .eq("status", "succeeded");

  const totalSold = (payments || []).reduce((s, p) => s + (p.amount || 0), 0);

  return {
    ...data,
    score,
    total_sold_cents: totalSold,
  };
}
