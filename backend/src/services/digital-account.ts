/**
 * Conta Digital FluxPay — PINs, tema e dados pessoais da carteira.
 * Reutiliza fluxpay_cards (password_hash = PIN de acesso).
 * pix_pin_hash = PIN exclusivo para autorizar Pix.
 * Nunca logar PIN, hash ou segredo.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";

const SCRYPT_KEYLEN = 64;
const PIN_MIN = 4;
const PIN_MAX = 8;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

function hashPin(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPin(plain: string, stored: string | null): boolean {
  if (!stored) return false;
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

function assertPinFormat(pin: string, label: string): void {
  if (!/^\d+$/.test(pin) || pin.length < PIN_MIN || pin.length > PIN_MAX) {
    throw new AppError(
      400,
      "validation_error",
      `${label} deve ter entre ${PIN_MIN} e ${PIN_MAX} digitos numericos.`
    );
  }
}

export async function setPixPin(params: {
  organizationId: string;
  userId: string;
  pixPin: string;
  pixPinConfirmation: string;
}): Promise<void> {
  assertPinFormat(params.pixPin, "PIN Pix");
  if (params.pixPin !== params.pixPinConfirmation) {
    throw new AppError(400, "validation_error", "Confirmacao do PIN Pix nao confere.");
  }

  const { data: card } = await supabaseAdmin
    .from("fluxpay_cards")
    .select("id, status")
    .eq("organization_id", params.organizationId)
    .in("status", ["pending_review", "approved", "blocked"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!card) {
    throw new AppError(404, "not_found", "Conta digital nao encontrada. Conclua o cadastro primeiro.");
  }

  const pixPinHash = hashPin(params.pixPin);
  const { error } = await supabaseAdmin
    .from("fluxpay_cards")
    .update({
      pix_pin_hash: pixPinHash,
      pix_pin_fail_count: 0,
      pix_pin_locked_until: null,
    })
    .eq("id", card.id);

  if (error) {
    console.error("[digital-account] setPixPin:", error.message);
    throw new AppError(500, "api_error", "Nao foi possivel salvar o PIN Pix.");
  }
}

export async function verifyPixPin(params: {
  organizationId: string;
  pixPin: string;
}): Promise<void> {
  assertPinFormat(params.pixPin, "PIN Pix");

  const { data: card, error } = await supabaseAdmin
    .from("fluxpay_cards")
    .select("id, pix_pin_hash, pix_pin_fail_count, pix_pin_locked_until, status")
    .eq("organization_id", params.organizationId)
    .in("status", ["approved", "blocked"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !card) {
    throw new AppError(404, "not_found", "Conta digital nao encontrada ou nao aprovada.");
  }

  if (card.status === "blocked") {
    throw new AppError(403, "permission_error", "Conta digital bloqueada.");
  }

  if (!card.pix_pin_hash) {
    throw new AppError(400, "validation_error", "PIN Pix ainda nao foi configurado.");
  }

  if (card.pix_pin_locked_until) {
    const lockedUntil = new Date(card.pix_pin_locked_until).getTime();
    if (lockedUntil > Date.now()) {
      const mins = Math.ceil((lockedUntil - Date.now()) / 60000);
      throw new AppError(
        429,
        "rate_limit_error",
        `Muitas tentativas incorretas. Tente novamente em ${mins} minuto(s).`
      );
    }
  }

  const ok = verifyPin(params.pixPin, card.pix_pin_hash);
  if (!ok) {
    const fails = (card.pix_pin_fail_count || 0) + 1;
    const update: Record<string, unknown> = { pix_pin_fail_count: fails };
    if (fails >= MAX_FAILS) {
      update.pix_pin_locked_until = new Date(
        Date.now() + LOCK_MINUTES * 60 * 1000
      ).toISOString();
      update.pix_pin_fail_count = 0;
    }
    await supabaseAdmin.from("fluxpay_cards").update(update).eq("id", card.id);
    throw new AppError(401, "authentication_error", "PIN Pix incorreto.");
  }

  if (card.pix_pin_fail_count > 0 || card.pix_pin_locked_until) {
    await supabaseAdmin
      .from("fluxpay_cards")
      .update({ pix_pin_fail_count: 0, pix_pin_locked_until: null })
      .eq("id", card.id);
  }
}

export async function setThemePreference(params: {
  organizationId: string;
  theme: "dark" | "light";
}): Promise<void> {
  if (params.theme !== "dark" && params.theme !== "light") {
    throw new AppError(400, "validation_error", "Tema invalido.");
  }
  const { error } = await supabaseAdmin
    .from("fluxpay_cards")
    .update({ theme_preference: params.theme })
    .eq("organization_id", params.organizationId)
    .in("status", ["pending_review", "approved", "blocked"]);
  if (error) {
    throw new AppError(500, "api_error", "Nao foi possivel salvar o tema.");
  }
}

export async function getDigitalAccountSummary(organizationId: string) {
  const { data: card } = await supabaseAdmin
    .from("fluxpay_cards")
    .select(
      "id, full_name, phone, status, card_number, theme_preference, cpf, birth_date, email, rejection_reason, created_at, reviewed_at"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!card) return null;

  return {
    id: card.id,
    full_name: card.full_name,
    phone: card.phone,
    status: card.status,
    card_number_masked: card.card_number
      ? `•••• ${String(card.card_number).slice(-4)}`
      : null,
    theme_preference: card.theme_preference || "dark",
    has_pix_pin: false, // nao expor se tem hash; frontend descobre via tentativa controlada ou flag dedicada
    cpf_masked: card.cpf
      ? `***${String(card.cpf).slice(-4)}`
      : null,
    birth_date: card.birth_date,
    email: card.email,
    rejection_reason: card.rejection_reason,
    created_at: card.created_at,
    reviewed_at: card.reviewed_at,
  };
}
