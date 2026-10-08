import { supabaseAdmin } from "../config/supabase.js";
import { getMongoDb, isMongoConfigured, type PublicProfileDoc } from "../config/mongo.js";
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

async function loadOrgBase(organizationId: string) {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id, slug, name, logo_url, created_at, status")
    .eq("id", organizationId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/**
 * Seed one-time a partir das colunas legadas em organizations (migration 021).
 * Não apaga as colunas; apenas migra leitura para Mongo quando há dados legados.
 */
async function seedFromSupabaseOrg(organizationId: string): Promise<PublicProfileDoc | null> {
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select(
      "id, slug, name, public_display_name, public_bio, public_work, public_avatar_url, public_profile_enabled, logo_url, created_at, status"
    )
    .eq("id", organizationId)
    .maybeSingle();

  if (!org || !org.slug) return null;

  const now = new Date().toISOString();
  const doc: PublicProfileDoc = {
    organization_id: org.id,
    slug: String(org.slug).toLowerCase(),
    display_name: (org.public_display_name as string) || (org.name as string) || null,
    bio: (org.public_bio as string) || null,
    work: (org.public_work as string) || null,
    avatar_url: (org.public_avatar_url as string) || (org.logo_url as string) || null,
    enabled: Boolean(org.public_profile_enabled),
    member_since: (org.created_at as string) || null,
    created_at: now,
    updated_at: now,
  };

  const mongo = await getMongoDb();
  if (!mongo) return doc;

  try {
    await mongo.collection<PublicProfileDoc>("public_profiles").updateOne(
      { organization_id: organizationId },
      { $setOnInsert: doc },
      { upsert: true }
    );
    const stored = await mongo
      .collection<PublicProfileDoc>("public_profiles")
      .findOne({ organization_id: organizationId });
    return stored || doc;
  } catch {
    return doc;
  }
}

async function getProfileDocBySlug(slug: string): Promise<PublicProfileDoc | null> {
  const normalized = slug.trim().toLowerCase();
  const mongo = await getMongoDb();

  if (mongo) {
    const doc = await mongo.collection<PublicProfileDoc>("public_profiles").findOne({
      slug: normalized,
      enabled: true,
    });
    if (doc) return doc;
  }

  // Compatibilidade: colunas legadas em organizations (não apagadas)
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select(
      "id, slug, name, public_display_name, public_bio, public_work, public_avatar_url, public_profile_enabled, logo_url, created_at, status"
    )
    .eq("slug", normalized)
    .eq("public_profile_enabled", true)
    .eq("status", "active")
    .maybeSingle();

  if (!org) return null;

  const seeded = await seedFromSupabaseOrg(org.id as string);
  if (seeded && seeded.enabled) return seeded;
  return null;
}

async function getProfileDocByOrgId(organizationId: string): Promise<PublicProfileDoc | null> {
  const mongo = await getMongoDb();
  if (mongo) {
    const doc = await mongo
      .collection<PublicProfileDoc>("public_profiles")
      .findOne({ organization_id: organizationId });
    if (doc) return doc;
  }
  return seedFromSupabaseOrg(organizationId);
}

async function buildPublicPayload(profile: PublicProfileDoc, orgId: string) {
  const { data: stats } = await supabaseAdmin.rpc("get_org_succeeded_sales_stats", {
    p_organization_id: orgId,
    p_environment: "live",
  });

  let totalSold = 0;
  let paymentCount = 0;
  if (Array.isArray(stats) && stats[0]) {
    totalSold = Number(stats[0].total_amount_cents) || 0;
    paymentCount = Number(stats[0].payment_count) || 0;
  } else {
    const { data: payments } = await supabaseAdmin
      .from("payments")
      .select("amount")
      .eq("organization_id", orgId)
      .eq("environment", "live")
      .eq("status", "succeeded");
    for (const p of payments || []) {
      totalSold += p.amount || 0;
      paymentCount += 1;
    }
  }

  const score = await computeFluxPayScore(orgId, "live");

  let rankingPosition: number | null = null;
  try {
    const board = await getRankingBoard(100);
    const found = board.find((e) => e.organization_id === orgId);
    if (found) rankingPosition = found.position;
  } catch {
    // ranking optional
  }

  return {
    slug: profile.slug,
    display_name: (profile.display_name && profile.display_name.trim()) || "Vendedor FluxPay",
    bio: profile.bio || null,
    work: profile.work || null,
    avatar_url: profile.avatar_url || null,
    total_sold_cents: totalSold,
    payment_count: paymentCount,
    score: score.score,
    score_level: score.level,
    score_level_label: score.level_label,
    ranking_position: rankingPosition,
    member_since: profile.member_since || new Date().toISOString(),
  };
}

export async function getPublicProfile(slug: string) {
  const profile = await getProfileDocBySlug(slug);
  if (!profile || !profile.enabled) {
    throw new AppError(404, "not_found", "Perfil nao encontrado.");
  }

  const org = await loadOrgBase(profile.organization_id);
  if (!org || org.status !== "active") {
    throw new AppError(404, "not_found", "Perfil nao encontrado.");
  }

  return buildPublicPayload(profile, profile.organization_id);
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
  const org = await loadOrgBase(organizationId);
  if (!org) {
    throw new AppError(404, "not_found", "Organizacao nao encontrada.");
  }

  const existing = (await getProfileDocByOrgId(organizationId)) || {
    organization_id: organizationId,
    slug: String(org.slug || "").toLowerCase(),
    display_name: (org.name as string) || null,
    bio: null,
    work: null,
    avatar_url: (org.logo_url as string) || null,
    enabled: false,
    member_since: (org.created_at as string) || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const now = new Date().toISOString();
  let nextSlug = existing.slug;

  if (input.slug !== undefined) {
    nextSlug = validateSlug(input.slug);
    const mongo = await getMongoDb();
    if (mongo) {
      const clash = await mongo.collection<PublicProfileDoc>("public_profiles").findOne({
        slug: nextSlug,
        organization_id: { $ne: organizationId },
      });
      if (clash) {
        throw new AppError(409, "invalid_request", "Este slug ja esta em uso.");
      }
    }
    // Também valida contra organizations.slug legado para evitar colisão
    const { data: existingOrg } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("slug", nextSlug)
      .neq("id", organizationId)
      .maybeSingle();
    if (existingOrg) {
      throw new AppError(409, "invalid_request", "Este slug ja esta em uso.");
    }
  }

  if (input.public_avatar_url !== undefined) {
    const url = input.public_avatar_url;
    if (url && !/^https?:\/\//i.test(url)) {
      throw new AppError(400, "validation_error", "URL da foto invalida.");
    }
  }

  const doc: PublicProfileDoc = {
    organization_id: organizationId,
    slug: nextSlug || String(org.slug || "").toLowerCase(),
    display_name:
      input.public_display_name !== undefined
        ? input.public_display_name.trim().slice(0, 80) || null
        : existing.display_name,
    bio:
      input.public_bio !== undefined
        ? input.public_bio.trim().slice(0, 500) || null
        : existing.bio,
    work:
      input.public_work !== undefined
        ? input.public_work.trim().slice(0, 120) || null
        : existing.work,
    avatar_url:
      input.public_avatar_url !== undefined ? input.public_avatar_url : existing.avatar_url,
    enabled:
      input.public_profile_enabled !== undefined
        ? input.public_profile_enabled
        : existing.enabled,
    member_since: existing.member_since || (org.created_at as string) || null,
    created_at: existing.created_at || now,
    updated_at: now,
  };

  if (!doc.slug || doc.slug.length < 3) {
    throw new AppError(400, "validation_error", "Slug deve ter pelo menos 3 caracteres.");
  }

  const mongo = await getMongoDb();
  if (mongo) {
    try {
      await mongo.collection<PublicProfileDoc>("public_profiles").updateOne(
        { organization_id: organizationId },
        { $set: doc },
        { upsert: true }
      );
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        throw new AppError(409, "invalid_request", "Este slug ja esta em uso.");
      }
      throw err;
    }
  } else if (isMongoConfigured()) {
    throw new AppError(503, "service_unavailable", "MongoDB indisponivel.");
  } else {
    // Fallback documentado: Mongo não configurado → grava colunas legadas (compat)
    const updates: Record<string, unknown> = {
      updated_at: now,
      public_display_name: doc.display_name,
      public_bio: doc.bio,
      public_work: doc.work,
      public_avatar_url: doc.avatar_url,
      public_profile_enabled: doc.enabled,
      slug: doc.slug,
    };
    const { error } = await supabaseAdmin
      .from("organizations")
      .update(updates)
      .eq("id", organizationId);
    if (error) throw new AppError(500, "api_error", error.message);
  }

  // Mantém organizations.slug alinhado para rotas que ainda leem slug da org
  if (input.slug !== undefined || !org.slug) {
    await supabaseAdmin
      .from("organizations")
      .update({ slug: doc.slug, updated_at: now })
      .eq("id", organizationId);
  }

  return {
    id: organizationId,
    slug: doc.slug,
    name: org.name,
    public_display_name: doc.display_name,
    public_bio: doc.bio,
    public_work: doc.work,
    public_avatar_url: doc.avatar_url,
    public_profile_enabled: doc.enabled,
    logo_url: org.logo_url,
  };
}

export async function getOwnProfileSettings(organizationId: string) {
  const org = await loadOrgBase(organizationId);
  if (!org) {
    throw new AppError(404, "not_found", "Organizacao nao encontrada.");
  }

  const profile = await getProfileDocByOrgId(organizationId);
  const score = await computeFluxPayScore(organizationId, "live");

  const { data: payments } = await supabaseAdmin
    .from("payments")
    .select("amount")
    .eq("organization_id", organizationId)
    .eq("environment", "live")
    .eq("status", "succeeded");

  const totalSold = (payments || []).reduce((s, p) => s + (p.amount || 0), 0);

  return {
    id: organizationId,
    slug: profile?.slug || org.slug,
    name: org.name,
    public_display_name: profile?.display_name ?? null,
    public_bio: profile?.bio ?? null,
    public_work: profile?.work ?? null,
    public_avatar_url: profile?.avatar_url ?? null,
    public_profile_enabled: profile?.enabled ?? false,
    logo_url: org.logo_url,
    score,
    total_sold_cents: totalSold,
  };
}
