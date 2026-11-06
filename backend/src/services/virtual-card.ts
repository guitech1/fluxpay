/**
 * Cartao virtual da Carteira Digital.
 * Emissao via subconta documentada: GET/POST /api/shops/{id}/card
 * Saldo minimo R$ 100,00 validado no ledger FluxPay (nao debita automaticamente).
 * Mensagens amigaveis — nunca expor nome do fornecedor ao cliente.
 */
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";
import { getBalance } from "./balance.js";
import type { NexusPagCardInfo } from "../providers/nexuspag.js";
import {
  getShopCard,
  requestShopCard,
  getShopCardDetails,
  createShopCardRecharge,
} from "../providers/nexuspag-shop-card.js";

export const VIRTUAL_CARD_MIN_BALANCE_CENTS = 10_000; // R$ 100,00

function shopRefForOrg(organizationId: string): string {
  return organizationId;
}

function friendlyProviderError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes("saldo") || lower.includes("balance") || lower.includes("min_balance")) {
    throw new AppError(
      400,
      "validation_error",
      "Voce precisa ter pelo menos R$ 100,00 de saldo disponivel para solicitar seu cartao virtual."
    );
  }
  if (lower.includes("401") || lower.includes("403") || lower.includes("auth")) {
    throw new AppError(502, "api_error", "Nao foi possivel processar a solicitacao agora. Tente novamente em instantes.");
  }
  if (lower.includes("404")) {
    throw new AppError(404, "not_found", "Cartao nao encontrado.");
  }
  console.error("[virtual-card] provider error:", msg);
  throw new AppError(
    502,
    "api_error",
    "Nao foi possivel concluir a operacao do cartao. Tente novamente mais tarde."
  );
}

async function requireApprovedWallet(organizationId: string) {
  const { data: card } = await supabaseAdmin
    .from("fluxpay_cards")
    .select("id, status, full_name, cpf, email, phone")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!card) {
    throw new AppError(
      400,
      "validation_error",
      "Solicite sua carteira digital antes de pedir o cartao virtual."
    );
  }
  if (card.status === "pending_review") {
    throw new AppError(
      400,
      "validation_error",
      "Sua carteira esta aguardando aprovacao. Aguarde a analise para solicitar o cartao."
    );
  }
  if (card.status === "rejected") {
    throw new AppError(
      400,
      "validation_error",
      "Sua carteira foi reprovada. Entre em contato com o suporte."
    );
  }
  if (card.status === "blocked") {
    throw new AppError(403, "permission_error", "Sua carteira esta bloqueada.");
  }
  if (card.status !== "approved") {
    throw new AppError(400, "validation_error", "Sua carteira precisa estar aprovada.");
  }
  if (!card.cpf || !card.full_name) {
    throw new AppError(
      400,
      "validation_error",
      "Complete o cadastro da carteira com nome e CPF antes de solicitar o cartao."
    );
  }
  return card;
}

async function requireMinLedgerBalance(organizationId: string, environment: "test" | "live") {
  const balance = await getBalance(organizationId, environment);
  const brl = balance.available.find((b) => b.currency === "BRL");
  const available = brl?.amount ?? 0;
  if (available < VIRTUAL_CARD_MIN_BALANCE_CENTS) {
    throw new AppError(
      400,
      "validation_error",
      "Voce precisa ter pelo menos R$ 100,00 de saldo disponivel para solicitar seu cartao virtual."
    );
  }
  return available;
}

function presentCardInfo(card: NexusPagCardInfo) {
  const hasCard = Boolean(card.status || card.last4);
  return {
    issued: hasCard,
    status: card.status,
    last4: card.last4,
    printed_name: card.printedName,
    balance_cents: card.balanceCents,
    can_request: !hasCard && card.canCreate,
    min_balance_cents: VIRTUAL_CARD_MIN_BALANCE_CENTS,
  };
}

export async function getVirtualCardForOrg(params: {
  organizationId: string;
  environment: "test" | "live";
}) {
  await requireApprovedWallet(params.organizationId);
  const shopId = shopRefForOrg(params.organizationId);
  try {
    const card = await getShopCard(shopId);
    return presentCardInfo(card);
  } catch (err) {
    friendlyProviderError(err);
  }
}

export async function requestVirtualCardForOrg(params: {
  organizationId: string;
  environment: "test" | "live";
}) {
  const wallet = await requireApprovedWallet(params.organizationId);
  await requireMinLedgerBalance(params.organizationId, params.environment);

  const shopId = shopRefForOrg(params.organizationId);
  const document = String(wallet.cpf).replace(/\D/g, "");
  const name = String(wallet.full_name).trim();

  try {
    const card = await requestShopCard(shopId, {
      document,
      documentType: "CPF",
      name,
    });
    return presentCardInfo(card);
  } catch (err) {
    friendlyProviderError(err);
  }
}

export async function getVirtualCardDetailsForOrg(params: {
  organizationId: string;
}) {
  await requireApprovedWallet(params.organizationId);
  const shopId = shopRefForOrg(params.organizationId);
  try {
    return await getShopCardDetails(shopId);
  } catch (err) {
    friendlyProviderError(err);
  }
}

export async function rechargeVirtualCardForOrg(params: {
  organizationId: string;
  environment: "test" | "live";
  amountCents: number;
  idempotencyKey?: string;
}) {
  await requireApprovedWallet(params.organizationId);
  if (!Number.isInteger(params.amountCents) || params.amountCents < 100) {
    throw new AppError(400, "validation_error", "Informe um valor minimo de R$ 1,00.");
  }
  const shopId = shopRefForOrg(params.organizationId);
  try {
    return await createShopCardRecharge(shopId, {
      amountCents: params.amountCents,
      idempotencyKey: params.idempotencyKey,
    });
  } catch (err) {
    friendlyProviderError(err);
  }
}
