/**
 * Transferencia interna entre carteiras FluxPay Card (ledger).
 */
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";
import { getBalance } from "./balance.js";
import { getCardByOrganization, getCardByNumber } from "./fluxpay-card.js";

const PASSWORD_MAX_FAILS = 5;
const PASSWORD_LOCK_MINUTES = 15;
const SCRYPT_KEYLEN = 64;

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
        `Muitas tentativas. Tente novamente em ${mins} minuto(s).`
      );
    }
  }

  if (!card.password_hash || !verifyPassword(password, card.password_hash)) {
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
    throw new AppError(400, "validation_error", "Informe um valor valido maior que zero.");
  }
  if (params.amountCents > 500_000_00) {
    throw new AppError(400, "validation_error", "Valor acima do limite permitido.");
  }

  const idemKey = (params.idempotencyKey || "").trim().slice(0, 128);
  if (!idemKey || idemKey.length < 8) {
    throw new AppError(400, "validation_error", "Chave de idempotencia invalida.");
  }

  const source = await getCardByOrganization(params.organizationId);
  if (!source) {
    throw new AppError(404, "not_found", "Voce ainda nao possui uma carteira FluxPay Card.");
  }
  if (source.status === "blocked") {
    throw new AppError(400, "validation_error", "Sua carteira esta bloqueada.");
  }
  if (source.status !== "approved") {
    throw new AppError(400, "validation_error", "Sua carteira precisa estar aprovada.");
  }

  await verifyCardPassword(source.id, params.password);

  const destDigits = (params.destinationCardNumber || "").replace(/\D/g, "");
  if (destDigits.length !== 16) {
    throw new AppError(400, "validation_error", "Numero da carteira destinataria invalido.");
  }
  if (source.card_number && source.card_number === destDigits) {
    throw new AppError(400, "validation_error", "Nao e possivel transferir para a propria carteira.");
  }

  const destination = await getCardByNumber(destDigits);
  if (!destination || destination.status !== "approved") {
    throw new AppError(404, "not_found", "Carteira destinataria nao encontrada ou nao aprovada.");
  }

  const balance = await getBalance(params.organizationId, params.environment);
  const brl = balance.available.find((b) => b.currency === "BRL");
  if ((brl?.amount ?? 0) < params.amountCents) {
    throw new AppError(400, "validation_error", "Saldo insuficiente.");
  }

  const publicId = generatePublicTxId();

  const { data: row, error } = await supabaseAdmin.rpc("fluxpay_card_transfer", {
    p_source_card_id: source.id,
    p_destination_card_id: destination.id,
    p_organization_id: params.organizationId,
    p_destination_organization_id: destination.organization_id,
    p_user_id: params.userId,
    p_amount_cents: params.amountCents,
    p_environment: params.environment,
    p_idempotency_key: idemKey,
    p_public_id: publicId,
  });

  if (error) {
    console.error("[fluxpay-card] transfer rpc:", error.message);
    const msg = String(error.message || "").toLowerCase();
    if (msg.includes("insufficient") || error.code === "P0001") {
      throw new AppError(400, "validation_error", "Saldo insuficiente.");
    }
    if (msg.includes("duplicate") || error.code === "23505") {
      const { data: existing } = await supabaseAdmin
        .from("fluxpay_card_transfers")
        .select("id, public_id, status, amount, created_at")
        .eq("idempotency_key", idemKey)
        .eq("organization_id", params.organizationId)
        .maybeSingle();
      if (existing) {
        return {
          id: existing.id,
          public_id: existing.public_id,
          status: existing.status,
          amount: existing.amount,
          destination_name: destination.full_name,
          destination_card_masked:
            destDigits.length >= 4 ? `•••• ${destDigits.slice(-4)}` : "••••",
          created_at: existing.created_at,
          already_existed: true,
        };
      }
    }
    throw new AppError(500, "api_error", "Nao foi possivel concluir a transferencia.");
  }

  const result = Array.isArray(row) ? row[0] : row;
  if (!result) {
    throw new AppError(500, "api_error", "Transferencia sem retorno do ledger.");
  }

  await writeAudit({
    cardId: source.id,
    organizationId: params.organizationId,
    actorUserId: params.userId,
    actorType: "user",
    action: "card.transfer",
    metadata: {
      amount_cents: params.amountCents,
      destination_last4: destDigits.slice(-4),
      public_id: result.public_id || publicId,
    },
    ipAddress: params.ipAddress,
  });

  return {
    id: result.id,
    public_id: result.public_id || publicId,
    status: result.status || "completed",
    amount: result.amount ?? params.amountCents,
    destination_name: destination.full_name,
    destination_card_masked:
      destDigits.length >= 4 ? `•••• ${destDigits.slice(-4)}` : "••••",
    created_at: result.created_at || new Date().toISOString(),
    already_existed: Boolean(result.already_existed),
  };
}
