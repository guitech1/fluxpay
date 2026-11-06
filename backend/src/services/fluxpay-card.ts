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
  cpf: string | null;
  birth_date: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export type SafeFluxPayCard = FluxPayCardRow;

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_FAILS = 5;
const PASSWORD_LOCK_MINUTES = 15;
const SCRYPT_KEYLEN = 64;

const SAFE_SELECT =
  "id, organization_id, user_id, full_name, phone, status, card_number, rejection_reason, reviewed_by, reviewed_at, blocked_at, blocked_by, block_reason, password_fail_count, password_locked_until, cpf, birth_date, email, created_at, updated_at";

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

function assertCpf(cpf: string): string {
  const digits = (cpf || "").replace(/\D/g, "");
  if (digits.length !== 11) {
    throw new AppError(400, "validation_error", "CPF deve ter 11 digitos.");
  }
  if (/^(\d)\1{10}$/.test(digits)) {
    throw new AppError(400, "validation_error", "CPF invalido.");
  }
  const calc = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += parseInt(base[i]!, 10) * (factor - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  const d1 = calc(digits.slice(0, 9), 10);
  const d2 = calc(digits.slice(0, 10), 11);
  if (d1 !== parseInt(digits[9]!, 10) || d2 !== parseInt(digits[10]!, 10)) {
    throw new AppError(400, "validation_error", "CPF invalido.");
  }
  return digits;
}

function assertEmail(email: string): string {
  const e = (email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) {
    throw new AppError(400, "validation_error", "E-mail invalido.");
  }
  return e;
}

function assertBirthDate(birthDate: string): string {
  const raw = (birthDate || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new AppError(400, "validation_error", "Data de nascimento invalida.");
  }
  const d = new Date(raw + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) {
    throw new AppError(400, "validation_error", "Data de nascimento invalida.");
  }
  const now = new Date();
  const age =
    now.getUTCFullYear() -
    d.getUTCFullYear() -
    (now.getUTCMonth() < d.getUTCMonth() ||
    (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())
      ? 1
      : 0);
  if (age < 18 || age > 120) {
    throw new AppError(
      400,
      "validation_error",
      "Titular deve ter entre 18 e 120 anos."
    );
  }
  return raw;
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
  cpf: string;
  email: string;
  birthDate: string;
  ipAddress?: string | null;
}): Promise<SafeFluxPayCard> {
  const fullName = assertFullName(params.fullName);
  const phone = assertPhone(params.phone);
  const cpf = assertCpf(params.cpf);
  const email = assertEmail(params.email);
  const birthDate = assertBirthDate(params.birthDate);
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

  const { data: cpfClash } = await supabaseAdmin
    .from("fluxpay_cards")
    .select("id, organization_id, status")
    .eq("cpf", cpf)
    .neq("status", "rejected")
    .limit(1)
    .maybeSingle();
  if (cpfClash && cpfClash.organization_id !== params.organizationId) {
    throw new AppError(
      409,
      "conflict",
      "Este CPF ja esta vinculado a outra conta digital."
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
      cpf,
      email,
      birth_date: birthDate,
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
    metadata: {
      full_name: fullName,
      phone,
      cpf_last4: cpf.slice(-4),
      email_domain: email.split("@")[1] ?? null,
    },
    ipAddress: params.ipAddress,
  });

  return stripSensitive(data);
}

/* PART2_CONTINUES */
