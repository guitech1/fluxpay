/**
 * Operacoes de cartao FluxPay apos o cadastro (approve/reject/block/list/present).
 */
import { randomBytes } from "crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";
import type { SafeFluxPayCard } from "./fluxpay-card.js";
import { formatCardNumberDisplay } from "./fluxpay-card.js";

const SAFE_SELECT =
  "id, organization_id, user_id, full_name, phone, status, kyc_status, kyc_submitted_at, card_number, rejection_reason, reviewed_by, reviewed_at, blocked_at, blocked_by, block_reason, password_fail_count, password_locked_until, cpf, birth_date, email, created_at, updated_at";

function stripSensitive(row: Record<string, unknown>): SafeFluxPayCard {
  const copy = { ...row };
  delete copy.password_hash;
  if (copy.kyc_status == null) copy.kyc_status = "pending";
  return copy as unknown as SafeFluxPayCard;
}

async function writeAudit(params: {
  cardId?: string | null;
  organizationId?: string | null;
  actorUserId?: string | null;
  actorType: "user" | "admin" | "system";
  action: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}): Promise<void> {
  try {
    await supabaseAdmin.from("fluxpay_card_audit_logs").insert({
      card_id: params.cardId ?? null,
      organization_id: params.organizationId ?? null,
      actor_user_id: params.actorUserId ?? null,
      actor_type: params.actorType,
      action: params.action,
      metadata: params.metadata ?? {},
      ip_address: params.ipAddress ?? null,
    });
  } catch (err) {
    console.error("[fluxpay-card] audit log failed:", (err as Error)?.message);
  }
}

export async function approveCard(params: {
  cardId: string;
  adminUserId: string;
  ipAddress?: string | null;
}): Promise<SafeFluxPayCard> {
  const { data: card, error: fetchErr } = await supabaseAdmin
    .from("fluxpay_cards")
    .select("*")
    .eq("id", params.cardId)
    .maybeSingle();

  if (fetchErr || !card) {
    throw new AppError(404, "not_found", "Carteira nao encontrada.");
  }

  const needsReview =
    card.status === "pending_review" ||
    card.kyc_status === "pending" ||
    card.kyc_status === "rejected";

  if (!needsReview && card.status !== "approved") {
    throw new AppError(
      400,
      "validation_error",
      `Nao e possivel aprovar carteira com status "${card.status}" / kyc "${card.kyc_status}".`
    );
  }

  if (!card.cpf || !card.email || !card.birth_date) {
    throw new AppError(
      400,
      "validation_error",
      "Cadastro incompleto (CPF, e-mail ou nascimento). O usuario precisa completar antes da aprovacao."
    );
  }

  let cardNumber = card.card_number as string | null;
  if (!cardNumber) {
    for (let i = 0; i < 30; i++) {
      const rand = randomBytes(8);
      let digits = "4821";
      for (let j = 0; j < 12; j++) {
        digits += String(rand[j % rand.length]! % 10);
      }
      const { data: clash } = await supabaseAdmin
        .from("fluxpay_cards")
        .select("id")
        .eq("card_number", digits)
        .maybeSingle();
      if (!clash) {
        cardNumber = digits;
        break;
      }
    }
    if (!cardNumber) {
      throw new AppError(500, "api_error", "Nao foi possivel gerar o numero do cartao.");
    }
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from("fluxpay_cards")
    .update({
      status: card.status === "blocked" ? "blocked" : "approved",
      kyc_status: "approved",
      card_number: cardNumber,
      reviewed_by: params.adminUserId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq("id", params.cardId)
    .select(SAFE_SELECT)
    .maybeSingle();

  if (updErr || !updated) {
    console.error("[fluxpay-card] approve:", updErr);
    throw new AppError(500, "api_error", "Nao foi possivel aprovar a carteira.");
  }

  await writeAudit({
    cardId: params.cardId,
    organizationId: updated.organization_id,
    actorUserId: params.adminUserId,
    actorType: "admin",
    action: "card.approved",
    metadata: {
      card_number_last4: String(cardNumber).slice(-4),
      kyc_status: "approved",
    },
    ipAddress: params.ipAddress,
  });

  return stripSensitive(updated);
}

export async function rejectCard(params: {
  cardId: string;
  adminUserId: string;
  reason?: string | null;
  ipAddress?: string | null;
}): Promise<SafeFluxPayCard> {
  const { data: card } = await supabaseAdmin
    .from("fluxpay_cards")
    .select("id, status, kyc_status, organization_id, card_number")
    .eq("id", params.cardId)
    .maybeSingle();

  if (!card) throw new AppError(404, "not_found", "Carteira nao encontrada.");

  const canReject =
    card.status === "pending_review" ||
    card.kyc_status === "pending" ||
    card.kyc_status === "approved";

  if (!canReject && card.status !== "rejected") {
    throw new AppError(
      400,
      "validation_error",
      `Nao e possivel rejeitar carteira com status "${card.status}" / kyc "${card.kyc_status}".`
    );
  }

  const reason = (params.reason || "").trim().slice(0, 500) || null;

  // Se ainda não tem número de cartão, volta status operacional para rejected.
  // Se já tinha conta antiga com número, mantém status approved/blocked e só marca kyc rejected.
  const nextStatus = card.card_number
    ? card.status === "blocked"
      ? "blocked"
      : "approved"
    : "rejected";

  const { data: updated, error } = await supabaseAdmin
    .from("fluxpay_cards")
    .update({
      status: nextStatus,
      kyc_status: "rejected",
      rejection_reason: reason,
      reviewed_by: params.adminUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", params.cardId)
    .select(SAFE_SELECT)
    .maybeSingle();

  if (error || !updated) {
    throw new AppError(500, "api_error", "Nao foi possivel rejeitar a carteira.");
  }

  await writeAudit({
    cardId: params.cardId,
    organizationId: updated.organization_id,
    actorUserId: params.adminUserId,
    actorType: "admin",
    action: "card.rejected",
    metadata: { reason, kyc_status: "rejected" },
    ipAddress: params.ipAddress,
  });

  return stripSensitive(updated);
}

export async function blockCard(params: {
  cardId: string;
  actorUserId: string;
  actorType: "user" | "admin";
  organizationId?: string;
  reason?: string | null;
  ipAddress?: string | null;
}): Promise<SafeFluxPayCard> {
  const { data: card } = await supabaseAdmin
    .from("fluxpay_cards")
    .select("*")
    .eq("id", params.cardId)
    .maybeSingle();

  if (!card) throw new AppError(404, "not_found", "Carteira nao encontrada.");

  if (params.actorType === "user") {
    if (!params.organizationId || card.organization_id !== params.organizationId) {
      throw new AppError(403, "permission_error", "Sem permissao para esta carteira.");
    }
  }

  if (card.status !== "approved") {
    throw new AppError(
      400,
      "validation_error",
      card.status === "blocked"
        ? "A carteira ja esta bloqueada."
        : "Somente carteiras aprovadas podem ser bloqueadas."
    );
  }

  const { data: updated, error } = await supabaseAdmin
    .from("fluxpay_cards")
    .update({
      status: "blocked",
      blocked_at: new Date().toISOString(),
      blocked_by: params.actorUserId,
      block_reason: (params.reason || "").trim().slice(0, 500) || null,
    })
    .eq("id", params.cardId)
    .eq("status", "approved")
    .select(SAFE_SELECT)
    .maybeSingle();

  if (error || !updated) {
    throw new AppError(500, "api_error", "Nao foi possivel bloquear a carteira.");
  }

  await writeAudit({
    cardId: params.cardId,
    organizationId: updated.organization_id,
    actorUserId: params.actorUserId,
    actorType: params.actorType,
    action: "card.blocked",
    metadata: { reason: params.reason ?? null },
    ipAddress: params.ipAddress,
  });

  return stripSensitive(updated);
}

export async function unblockCard(params: {
  cardId: string;
  actorUserId: string;
  actorType: "user" | "admin";
  organizationId?: string;
  ipAddress?: string | null;
}): Promise<SafeFluxPayCard> {
  const { data: card } = await supabaseAdmin
    .from("fluxpay_cards")
    .select("*")
    .eq("id", params.cardId)
    .maybeSingle();

  if (!card) throw new AppError(404, "not_found", "Carteira nao encontrada.");

  if (params.actorType === "user") {
    if (!params.organizationId || card.organization_id !== params.organizationId) {
      throw new AppError(403, "permission_error", "Sem permissao para esta carteira.");
    }
  }

  if (card.status !== "blocked") {
    throw new AppError(400, "validation_error", "A carteira nao esta bloqueada.");
  }

  const { data: updated, error } = await supabaseAdmin
    .from("fluxpay_cards")
    .update({
      status: "approved",
      blocked_at: null,
      blocked_by: null,
      block_reason: null,
    })
    .eq("id", params.cardId)
    .eq("status", "blocked")
    .select(SAFE_SELECT)
    .maybeSingle();

  if (error || !updated) {
    throw new AppError(500, "api_error", "Nao foi possivel desbloquear a carteira.");
  }

  await writeAudit({
    cardId: params.cardId,
    organizationId: updated.organization_id,
    actorUserId: params.actorUserId,
    actorType: params.actorType,
    action: "card.unblocked",
    ipAddress: params.ipAddress,
  });

  return stripSensitive(updated);
}

export function presentCard(card: SafeFluxPayCard) {
  const cpf = card.cpf ? String(card.cpf) : null;
  return {
    id: card.id,
    organization_id: card.organization_id,
    full_name: card.full_name,
    phone: card.phone,
    status: card.status,
    kyc_status: card.kyc_status ?? "pending",
    kyc_submitted_at: card.kyc_submitted_at ?? null,
    card_number: card.card_number,
    card_number_display: formatCardNumberDisplay(card.card_number),
    rejection_reason: card.rejection_reason,
    reviewed_at: card.reviewed_at,
    reviewed_by: card.reviewed_by,
    blocked_at: card.blocked_at,
    block_reason: card.block_reason,
    user_id: card.user_id,
    cpf_masked: cpf && cpf.length >= 4 ? `***${cpf.slice(-4)}` : null,
    birth_date: card.birth_date ?? null,
    email: card.email ?? null,
    created_at: card.created_at,
    updated_at: card.updated_at,
  };
}

export async function listCardsForAdmin(params: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: SafeFluxPayCard[]; total: number }> {
  let query = supabaseAdmin
    .from("fluxpay_cards")
    .select(`${SAFE_SELECT}, organization:organizations(name)`, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 50) - 1);

  // "Em análise": status pending_review OU kyc_status pending (contas antigas inclusas)
  if (params.status === "pending_review") {
    query = query.or("status.eq.pending_review,kyc_status.eq.pending");
  } else if (params.status) {
    query = query.eq("status", params.status);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("[fluxpay-card] list admin:", error);
    throw new AppError(500, "api_error", "Nao foi possivel listar carteiras.");
  }

  return {
    items: (data || []).map((r) => {
      const row = r as unknown as Record<string, unknown>;
      const organization = row.organization as { name?: string } | null;
      return {
        ...stripSensitive(row),
        organization_name: organization?.name ?? null,
      };
    }),
    total: count ?? (data || []).length,
  };
}
