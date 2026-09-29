import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";
import { getBalance } from "./balance.js";

export type FluxPayCardStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "blocked";

export interface FluxPayCardRow {
  id: string;
  organization_id: string;
  user_id: string;
  full_name: string;
  phone: string;
  status: FluxPayCardStatus;
  card_number: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  blocked_at: string | null;
  blocked_by: string | null;
  block_reason: string | null;
  password_fail_count: number;
  password_locked_until: string | null;
  created_at: string;
  updated_at: string;
}

export type SafeFluxPayCard = FluxPayCardRow;

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_FAILS = 5;
const PASSWORD_LOCK_MINUTES = 15;
const SCRYPT_KEYLEN = 64;

const SAFE_SELECT =
  "id, organization_id, user_id, full_name, phone, status, card_number, rejection_reason, reviewed_by, reviewed_at, blocked_at, blocked_by, block_reason, password_fail_count, password_locked_until, created_at, updated_at";

function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
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

function assertPasswordStrength(password: string): void {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    throw new AppError(
      400,
      "validation_error",
      `A senha da carteira deve ter no minimo ${PASSWORD_MIN_LENGTH} caracteres.`
    );
  }
  if (password.length > 128) {
    throw new AppError(400, "validation_error", "Senha muito longa.");
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new AppError(
      400,
      "validation_error",
      "A senha deve conter letras e numeros."
    );
  }
}

function assertFullName(name: string): string {
  const n = (name || "").trim().replace(/\s+/g, " ");
  if (n.length < 3) {
    throw new AppError(400, "validation_error", "Informe o nome completo.");
  }
  if (n.split(" ").filter(Boolean).length < 2) {
    throw new AppError(400, "validation_error", "Informe nome e sobrenome.");
  }
  if (n.length > 120) {
    throw new AppError(400, "validation_error", "Nome muito longo.");
  }
  return n;
}

function assertPhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) {
    throw new AppError(
      400,
      "validation_error",
      "Telefone invalido. Use DDD + numero."
    );
  }
  return digits;
}

function stripSensitive(row: Record<string, unknown>): SafeFluxPayCard {
  const copy = { ...row };
  delete copy.password_hash;
  return copy as unknown as SafeFluxPayCard;
}

export function formatCardNumberDisplay(num: string | null): string | null {
  if (!num) return null;
  return num.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function generatePublicTxId(): string {
  return `FP-${randomBytes(5).toString("hex").toUpperCase()}`;
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

export async function getCardByOrganization(
  organizationId: string
): Promise<SafeFluxPayCard | null> {
  const { data, error } = await supabaseAdmin
    .from("fluxpay_cards")
    .select(SAFE_SELECT)
    .eq("organization_id", organizationId)
    .in("status", ["pending_review", "approved", "blocked", "rejected"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[fluxpay-card] getCardByOrganization:", error);
    throw new AppError(500, "api_error", "Nao foi possivel carregar a carteira.");
  }
  if (!data) return null;
  return stripSensitive(data);
}

export async function getCardById(cardId: string): Promise<SafeFluxPayCard | null> {
  const { data, error } = await supabaseAdmin
    .from("fluxpay_cards")
    .select(SAFE_SELECT)
    .eq("id", cardId)
    .maybeSingle();

  if (error) {
    throw new AppError(500, "api_error", "Nao foi possivel carregar a carteira.");
  }
  if (!data) return null;
  return stripSensitive(data);
}

export async function getCardByNumber(
  cardNumber: string
): Promise<SafeFluxPayCard | null> {
  const digits = cardNumber.replace(/\D/g, "");
  if (digits.length !== 16) return null;

  const { data, error } = await supabaseAdmin
    .from("fluxpay_cards")
    .select(SAFE_SELECT)
    .eq("card_number", digits)
    .maybeSingle();

  if (error) {
    throw new AppError(500, "api_error", "Nao foi possivel localizar a carteira.");
  }
  if (!data) return null;
  return stripSensitive(data);
}

export async function lookupRecipient(cardNumber: string): Promise<{
  full_name: string;
  card_number_masked: string;
  status: FluxPayCardStatus;
} | null> {
  const card = await getCardByNumber(cardNumber);
  if (!card) return null;
  if (card.status !== "approved" && card.status !== "blocked") return null;
  const num = card.card_number || "";
  return {
    full_name: card.full_name,
    card_number_masked: num.length >= 4 ? `•••• ${num.slice(-4)}` : "••••",
    status: card.status,
  };
}

export async function createCard(params: {
  organizationId: string;
  userId: string;
  fullName: string;
  phone: string;
  password: string;
  passwordConfirmation: string;
  ipAddress?: string | null;
}): Promise<SafeFluxPayCard> {
  const fullName = assertFullName(params.fullName);
  const phone = assertPhone(params.phone);
  assertPasswordStrength(params.password);

  if (params.password !== params.passwordConfirmation) {
    throw new AppError(400, "validation_error", "A confirmacao da senha nao confere.");
  }

  const existing = await getCardByOrganization(params.organizationId);
  if (existing && existing.status !== "rejected") {
    throw new AppError(
      409,
      "conflict",
      "Esta organizacao ja possui uma carteira FluxPay Card."
    );
  }

  const passwordHash = hashPassword(params.password);

  const { data, error } = await supabaseAdmin
    .from("fluxpay_cards")
    .insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      full_name: fullName,
      phone,
      password_hash: passwordHash,
      status: "pending_review",
    })
    .select(SAFE_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AppError(
        409,
        "conflict",
        "Esta organizacao ja possui uma carteira FluxPay Card."
      );
    }
    console.error("[fluxpay-card] create:", error);
    throw new AppError(500, "api_error", "Nao foi possivel criar a carteira.");
  }

  await writeAudit({
    cardId: data.id,
    organizationId: params.organizationId,
    actorUserId: params.userId,
    actorType: "user",
    action: "card.created",
    metadata: { full_name: fullName, phone },
    ipAddress: params.ipAddress,
  });

  return stripSensitive(data);
}

async function generateUniqueCardNumber(): Promise<string> {
  const { data: genRows, error: genErr } = await supabaseAdmin.rpc(
    "fluxpay_generate_card_number"
  );

  if (!genErr && typeof genRows === "string" && /^\d{16}$/.test(genRows)) {
    return genRows;
  }
  if (
    !genErr &&
    Array.isArray(genRows) &&
    typeof genRows[0] === "string" &&
    /^\d{16}$/.test(genRows[0])
  ) {
    return genRows[0];
  }

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
    if (!clash) return digits;
  }

  throw new AppError(500, "api_error", "Nao foi possivel gerar o numero do cartao.");
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
  if (card.status !== "pending_review") {
    throw new AppError(
      400,
      "validation_error",
      `Nao e possivel aprovar carteira com status "${card.status}".`
    );
  }

  const cardNumber = await generateUniqueCardNumber();

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

async function verifyCardPassword(cardId: string, password: string): Promise<void> {
  const { data: card, error } = await supabaseAdmin
    .from("fluxpay_cards")
    .select("id, password_hash, password_fail_count, password_locked_until")
    .eq("id", cardId)
    .maybeSingle();

  if (error || !card) {
    throw new AppError(404, "not_found", "Carteira nao encontrada.");
  }

  if (card.password_locked_until) {
    const lockedUntil = new Date(card.password_locked_until).getTime();
    if (lockedUntil > Date.now()) {
      const mins = Math.ceil((lockedUntil - Date.now()) / 60000);
      throw new AppError(
        429,
        "rate_limit_error",
        `Muitas tentativas incorretas. Tente novamente em ${mins} minuto(s).`
      );
    }
  }

  const ok = verifyPassword(password, card.password_hash);
  if (!ok) {
    const fails = (card.password_fail_count || 0) + 1;
    const update: Record<string, unknown> = { password_fail_count: fails };
    if (fails >= PASSWORD_MAX_FAILS) {
      update.password_locked_until = new Date(
        Date.now() + PASSWORD_LOCK_MINUTES * 60 * 1000
      ).toISOString();
      update.password_fail_count = 0;
    }
    await supabaseAdmin.from("fluxpay_cards").update(update).eq("id", cardId);
    throw new AppError(401, "authentication_error", "Senha da carteira incorreta.");
  }

  if (card.password_fail_count > 0 || card.password_locked_until) {
    await supabaseAdmin
      .from("fluxpay_cards")
      .update({ password_fail_count: 0, password_locked_until: null })
      .eq("id", cardId);
  }
}

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
  if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
    throw new AppError(
      400,
      "validation_error",
      "Informe um valor valido maior que zero."
    );
  }
  if (params.amountCents > 5_000_000_00) {
    throw new AppError(400, "validation_error", "Valor acima do limite permitido.");
  }

  const idemKey = (params.idempotencyKey || "").trim().slice(0, 128);
  if (!idemKey || idemKey.length < 8) {
    throw new AppError(400, "validation_error", "Chave de idempotencia invalida.");
  }

  const source = await getCardByOrganization(params.organizationId);
  if (!source) {
    throw new AppError(
      404,
      "not_found",
      "Voce ainda nao possui uma carteira FluxPay Card."
    );
  }
  if (source.status === "blocked") {
    throw new AppError(
      400,
      "validation_error",
      "Sua carteira esta bloqueada. Desbloqueie para transferir."
    );
  }
  if (source.status !== "approved") {
    throw new AppError(
      400,
      "validation_error",
      "Sua carteira precisa estar aprovada para transferir."
    );
  }

  await verifyCardPassword(source.id, params.password);

  const destDigits = params.destinationCardNumber.replace(/\D/g, "");
  if (destDigits.length !== 16) {
    throw new AppError(
      400,
      "validation_error",
      "Numero do cartao destinatario invalido."
    );
  }

  const destination = await getCardByNumber(destDigits);
  if (!destination) {
    throw new AppError(404, "not_found", "Carteira destinataria nao encontrada.");
  }
  if (destination.id === source.id) {
    throw new AppError(
      400,
      "validation_error",
      "Nao e possivel transferir para a propria carteira."
    );
  }
  if (destination.organization_id === source.organization_id) {
    throw new AppError(
      400,
      "validation_error",
      "Nao e possivel transferir para a propria organizacao."
    );
  }
  if (destination.status !== "approved" && destination.status !== "blocked") {
    throw new AppError(
      400,
      "validation_error",
      "A carteira destinataria nao pode receber transferencias."
    );
  }

  const balance = await getBalance(params.organizationId, params.environment);
  const brl = balance.available.find((b) => b.currency === "BRL");
  const available = brl?.amount ?? 0;
  if (params.amountCents > available) {
    throw new AppError(
      400,
      "insufficient_funds",
      `Saldo disponivel insuficiente. Disponivel: R$ ${(available / 100).toFixed(2).replace(".", ",")}.`
    );
  }

  const publicId = generatePublicTxId();

  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
    "fluxpay_card_transfer",
    {
      p_source_card_id: source.id,
      p_destination_card_id: destination.id,
      p_amount_cents: params.amountCents,
      p_requested_by: params.userId,
      p_idempotency_key: idemKey,
      p_public_id: publicId,
      p_environment: params.environment,
    }
  );

  if (rpcError) {
    const msg = rpcError.message || "";
    if (/insufficient funds/i.test(msg)) {
      throw new AppError(400, "insufficient_funds", "Saldo disponivel insuficiente.");
    }
    if (/not approved|blocked|eligible/i.test(msg)) {
      throw new AppError(
        400,
        "validation_error",
        "Carteira nao elegivel para esta operacao."
      );
    }
    if (/same card|same organization/i.test(msg)) {
      throw new AppError(400, "validation_error", "Transferencia invalida.");
    }
    console.error("[fluxpay-card] transfer rpc:", rpcError);
    throw new AppError(
      500,
      "api_error",
      "Nao foi possivel concluir a transferencia."
    );
  }

  const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
  if (!row) {
    throw new AppError(500, "api_error", "Resposta invalida da transferencia.");
  }

  await writeAudit({
    cardId: source.id,
    organizationId: params.organizationId,
    actorUserId: params.userId,
    actorType: "user",
    action: "card.transfer",
    metadata: {
      amount: params.amountCents,
      destination_last4: destDigits.slice(-4),
      public_id: row.public_id,
      already_existed: row.already_existed,
    },
    ipAddress: params.ipAddress,
  });

  return {
    id: row.transaction_id,
    public_id: row.public_id,
    status: row.status,
    amount: row.amount,
    destination_name: destination.full_name,
    destination_card_masked:
      destDigits.length >= 4 ? `•••• ${destDigits.slice(-4)}` : "••••",
    created_at: new Date().toISOString(),
    already_existed: Boolean(row.already_existed),
  };
}

export async function listCardsForAdmin(params: {
  status?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{
  items: Array<
    SafeFluxPayCard & { email?: string | null; organization_name?: string | null }
  >;
  total: number;
}> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);

  let query = supabaseAdmin
    .from("fluxpay_cards")
    .select(SAFE_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.status) {
    query = query.eq("status", params.status);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("[fluxpay-card] list admin:", error);
    throw new AppError(500, "api_error", "Nao foi possivel listar carteiras.");
  }

  const items = (data || []).map((r) => stripSensitive(r));
  const orgIds = [...new Set(items.map((i) => i.organization_id))];
  const userIds = [...new Set(items.map((i) => i.user_id))];

  const [{ data: orgs }, { data: users }] = await Promise.all([
    orgIds.length
      ? supabaseAdmin.from("organizations").select("id, name").in("id", orgIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    userIds.length
      ? supabaseAdmin.from("users").select("id, email").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; email: string }[] }),
  ]);

  const orgMap = new Map((orgs || []).map((o) => [o.id, o.name]));
  const userMap = new Map((users || []).map((u) => [u.id, u.email]));

  return {
    items: items.map((i) => ({
      ...i,
      email: userMap.get(i.user_id) ?? null,
      organization_name: orgMap.get(i.organization_id) ?? null,
    })),
    total: count ?? items.length,
  };
}

export function presentCard(card: SafeFluxPayCard) {
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
    created_at: card.created_at,
    updated_at: card.updated_at,
  };
}

/** Exportado apenas para testes unitarios (nao usado em rotas). */
export const _test = {
  hashPassword,
  verifyPassword,
  assertPasswordStrength,
  assertFullName,
  assertPhone,
  generatePublicTxId,
  formatCardNumberDisplay,
};
