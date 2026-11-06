/**
 * Cartao da subconta — documentacao oficial
 * GET/POST /api/shops/{id}/card
 * POST /api/shops/{id}/card/details
 * POST /api/shops/{id}/card/recharges
 */
import type { NexusPagCardInfo } from "./nexuspag.js";

const NEXUSPAG_BASE_URL = process.env.NEXUSPAG_BASE_URL || "https://nexuspag.com";

function getApiKey(): string {
  const key = process.env.NEXUSPAG_API_KEY;
  if (!key) throw new Error("NEXUSPAG_API_KEY nao configurada.");
  return key;
}

function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}

function reaisToCents(reais: number): number {
  return Math.round(reais * 100);
}

function mapShopCardPayload(data: any): NexusPagCardInfo {
  const card = data?.card ?? null;
  const rules = data?.rules ?? {};
  return {
    status: card?.status ?? null,
    last4: card?.last4 ?? card?.final ?? null,
    printedName: card?.name ?? card?.printed_name ?? null,
    balanceCents: card?.balance != null ? reaisToCents(Number(card.balance)) : null,
    canCreate: Boolean(data?.can_create ?? rules?.can_create ?? true),
    minBalanceToCreateCents:
      rules?.min_balance_to_create != null
        ? reaisToCents(Number(rules.min_balance_to_create))
        : null,
    raw: data,
  };
}

function shopCardBase(shopId: string): string {
  return `${NEXUSPAG_BASE_URL}/api/shops/${encodeURIComponent(shopId)}/card`;
}

/** GET /api/shops/{id}/card */
export async function getShopCard(shopId: string): Promise<NexusPagCardInfo> {
  const res = await fetch(shopCardBase(shopId), {
    headers: { "x-api-key": getApiKey() },
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    throw new Error(`shop card GET HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return mapShopCardPayload(data);
}

/**
 * POST /api/shops/{id}/card
 * Documento e nome do titular obrigatorios.
 * Nao debita saldo; min_balance e regra do emissor quando aplicavel.
 */
export async function requestShopCard(
  shopId: string,
  holder: { document: string; documentType: "CPF" | "CNPJ"; name: string }
): Promise<NexusPagCardInfo> {
  const body = {
    document: holder.document.replace(/\D/g, ""),
    document_type: holder.documentType,
    name: holder.name.trim(),
  };
  const res = await fetch(shopCardBase(shopId), {
    method: "POST",
    headers: { "x-api-key": getApiKey(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    throw new Error(`shop card POST HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  if (data?.card) return mapShopCardPayload(data);
  return getShopCard(shopId);
}

/** POST /api/shops/{id}/card/details — nao logar retorno */
export async function getShopCardDetails(shopId: string): Promise<{
  number: string | null;
  cvv: string | null;
  expiry: string | null;
  raw: unknown;
}> {
  const res = await fetch(`${shopCardBase(shopId)}/details`, {
    method: "POST",
    headers: { "x-api-key": getApiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    throw new Error(`shop card details HTTP ${res.status}`);
  }
  return {
    number: data?.number ?? data?.card_number ?? null,
    cvv: data?.cvv ?? null,
    expiry: data?.expiry ?? data?.expiration ?? null,
    raw: data,
  };
}

/** POST /api/shops/{id}/card/recharges */
export async function createShopCardRecharge(
  shopId: string,
  params: { amountCents: number; idempotencyKey?: string }
): Promise<{ id: string; status: string; raw: unknown }> {
  const body: Record<string, unknown> = {
    amount: centsToReais(params.amountCents),
  };
  if (params.idempotencyKey) body.idempotency_key = params.idempotencyKey;
  const res = await fetch(`${shopCardBase(shopId)}/recharges`, {
    method: "POST",
    headers: { "x-api-key": getApiKey(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  const data = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    throw new Error(`shop card recharge HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return {
    id: data?.id ?? data?.recharge?.id ?? "",
    status: data?.status ?? data?.recharge?.status ?? "pending",
    raw: data,
  };
}
