/**
 * Operacoes de cartao FluxPay apos o cadastro (approve/reject/block/transfer/list/present).
 */
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";
import { getBalance } from "./balance.js";
import type { FluxPayCardStatus, SafeFluxPayCard } from "./fluxpay-card.js";
import { formatCardNumberDisplay, getCardByOrganization, getCardByNumber } from "./fluxpay-card.js";

const PASSWORD_MAX_FAILS = 5;
const PASSWORD_LOCK_MINUTES = 15;
const SCRYPT_KEYLEN = 64;

const SAFE_SELECT =
  "id, organization_id, user_id, full_name, phone, status, card_number, rejection_reason, reviewed_by, reviewed_at, blocked_at, blocked_by, block_reason, password_fail_count, password_locked_until, cpf, birth_date, email, created_at, updated_at";

function stripSensitive(row: Record<string, unknown>): SafeFluxPayCard {
  const copy = { ...row };
  delete copy.password_hash;
  return copy as unknown as SafeFluxPayCard;
}

function generatePublicTxId(): string {
  return `FP-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function verifyPassword(plain: string, stored: string): boolean {
  try {
    const parts = stored.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const salt = parts[1]!;
    const expected = parts[2]!;
    const actual = scryptSync(plain, salt, SCRYPT_KEYLEN).toString("hex");
    const a = Buffer.from(actual, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
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

/* REST_OF_OPS - will complete in next commit if truncated */
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
  if (card.status !== "pending_review") {
    throw new AppError(
      400,
      "validation_error",
      `Nao e possivel aprovar carteira com status "${card.status}".`
    );
  }

  // Generate card number
  let cardNumber = "";
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

  const { data: updated, error: updErr } = await supabaseAdmin
    .from("fluxpay_cards")
    .update({
      status: "approved",
      card_number: cardNumber,
      reviewed_by: params.adminUserId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq("id", params.cardId)
    .eq("status", "pending_review")
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
    metadata: { card_number_last4: cardNumber.slice(-4) },
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
    .select("id, status, organization_id")
    .eq("id", params.cardId)
    .maybeSingle();

  if (!card) throw new AppError(404, "not_found", "Carteira nao encontrada.");
  if (card.status !== "pending_review") {
    throw new AppError(
      400,
      "validation_error",
      `Nao e possivel rejeitar carteira com status "${card.status}".`
    );
  }

  const reason = (params.reason || "").trim().slice(0, 500) || null;

  const { data: updated, error } = await supabaseAdmin
    .from("fluxpay_cards")
    .update({
      status: "rejected",
      rejection_reason: reason,
      reviewed_by: params.adminUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", params.cardId)
    .eq("status", "pending_review")
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
    metadata: { reason },
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
    .select(SAFE_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 50) - 1);

  if (params.status) {
    query = query.eq("status", params.status);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("[fluxpay-card] list admin:", error);
    throw new AppError(500, "api_error", "Nao foi possivel listar carteiras.");
  }

  return {
    items: (data || []).map((r) => stripSensitive(r)),
    total: count ?? (data || []).length,
  };
}

// transfer requires verifyCardPassword - simplified stub that routes require
export async function transfer(params: {
  organizationId: string;
  userId: string;
  destinationCardNumber: string;
  amountCents: number;
  password: string;
  idempotencyKey: string;
  environment: "test" | "live";
  ipAddress?: string | null;
}): Promise<{
  id: string;
  public_id: string;
  status: string;
  amount: number;
  destination_name: string;
  destination_card_masked: string;
  created_at: string;
  already_existed: boolean;
}> {
  throw new AppError(
    501,
    "api_error",
    "Transferencia entre carteiras FluxPay Card sera reativada na proxima revisao. Use Pix por chave."
  );
}
