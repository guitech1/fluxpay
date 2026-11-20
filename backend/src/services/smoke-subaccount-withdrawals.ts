/**
 * Saque de subconta SmokePay com as mesmas regras de aprovação da conta.
 * - stop_withdrawals global bloqueia tudo
 * - requires_manual_withdrawal_approval → pending no ADM (sem debitar ledger FluxPay)
 * - sem aprovação manual → chama Smoke na hora
 */
import { randomUUID } from "crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";
import type { Environment } from "../types/index.js";
import { assertWithdrawalsAllowed } from "./payout-controls.js";
import { getRequiresManualWithdrawalApproval } from "./withdrawal-approval.js";
import { withdrawFromSubaccount } from "./smokepay-shops.js";
import {
  getWithdrawal,
  mapWithdrawalRowForSmoke,
  publicWithdrawalView,
  type PixKeyType,
  type WithdrawalRequest,
} from "./withdrawals.js";

function assertPixKey(type: PixKeyType, key: string): void {
  const t = (key || "").trim();
  if (!t) throw new AppError(400, "validation_error", "Informe a chave Pix.");
  if (type === "email" && !t.includes("@")) {
    throw new AppError(400, "validation_error", "E-mail Pix invalido.");
  }
  if (type === "cpf" && t.replace(/\D/g, "").length !== 11) {
    throw new AppError(400, "validation_error", "CPF Pix invalido.");
  }
  if (type === "cnpj" && t.replace(/\D/g, "").length !== 14) {
    throw new AppError(400, "validation_error", "CNPJ Pix invalido.");
  }
}

export function isSmokeSubaccountWithdrawal(w: {
  provider_response?: unknown;
  metadata?: unknown;
}): boolean {
  const pr = (w.provider_response || {}) as Record<string, unknown>;
  const md = (w.metadata || {}) as Record<string, unknown>;
  return pr.source === "smoke_subaccount" || md.source === "smoke_subaccount";
}

export function smokeShopIdFromWithdrawal(w: {
  provider_response?: unknown;
  metadata?: unknown;
}): string | null {
  const pr = (w.provider_response || {}) as Record<string, unknown>;
  const md = (w.metadata || {}) as Record<string, unknown>;
  const id = pr.shop_id || md.shop_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export async function requestSmokeSubaccountWithdrawal(params: {
  organizationId: string;
  environment: Environment;
  shopId: string;
  amountReais: number;
  pixKey: string;
  pixKeyType?: string;
  requestedBy: string;
}): Promise<{
  mode: "executed" | "pending_approval";
  withdrawal?: WithdrawalRequest;
  smoke?: unknown;
}> {
  await assertWithdrawalsAllowed();

  if (params.environment !== "live") {
    throw new AppError(400, "invalid_request", "Saques so estao disponiveis em producao.");
  }

  const amountReais = Number(params.amountReais);
  if (!Number.isFinite(amountReais) || amountReais <= 0) {
    throw new AppError(400, "validation_error", "Informe um valor valido.");
  }

  // Guarda em centavos no pedido (padrão da tabela).
  const amountCents = Math.round(amountReais * 100);
  if (amountCents < 100) {
    throw new AppError(400, "validation_error", "Valor minimo: R$ 1,00.");
  }

  const pixKeyType = (params.pixKeyType || "random") as PixKeyType;
  assertPixKey(pixKeyType, params.pixKey);

  const requiresManual = await getRequiresManualWithdrawalApproval(params.organizationId);

  if (!requiresManual) {
    const smoke = await withdrawFromSubaccount({
      shopId: params.shopId,
      amountReais,
      pixKey: params.pixKey.trim(),
      pixKeyType: params.pixKeyType,
    });
    return { mode: "executed", smoke };
  }

  // Pedido pending — NÃO debita ledger FluxPay (saldo está na Smoke).
  const correlationId = randomUUID();
  const payload = {
    source: "smoke_subaccount",
    shop_id: params.shopId,
    amount_reais: amountReais,
  };

  const { data, error } = await supabaseAdmin
    .from("withdrawal_requests")
    .insert({
      organization_id: params.organizationId,
      environment: params.environment,
      amount: amountCents,
      fee: 0,
      fee_amount: 0,
      net: amountCents,
      net_amount: amountCents,
      currency: "BRL",
      pix_key: params.pixKey.trim(),
      pix_key_type: pixKeyType,
      status: "pending",
      requested_by: params.requestedBy,
      correlation_id: correlationId,
      provider: "smokepay",
      provider_response: payload,
      metadata: payload,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[smoke-sub-wd] insert pending:", error?.message);
    throw new AppError(500, "api_error", "Nao foi possivel registrar o pedido de saque da subconta.");
  }

  return {
    mode: "pending_approval",
    withdrawal: mapWithdrawalRowForSmoke(data),
  };
}

/** Executa na Smoke após aprovação ADM (sem failover de outras adquirentes). */
export async function executeSmokeSubaccountWithdrawal(
  w: WithdrawalRequest
): Promise<WithdrawalRequest> {
  await assertWithdrawalsAllowed();

  const shopId = smokeShopIdFromWithdrawal(w);
  if (!shopId) {
    throw new AppError(500, "api_error", "Pedido de subconta sem shop_id.");
  }

  const amountReais =
    typeof (w as any).provider_response?.amount_reais === "number"
      ? Number((w as any).provider_response.amount_reais)
      : w.net / 100;

  const smoke = await withdrawFromSubaccount({
    shopId,
    amountReais,
    pixKey: w.pix_key,
    pixKeyType: w.pix_key_type,
  });

  const { data: updated, error } = await supabaseAdmin
    .from("withdrawal_requests")
    .update({
      status: "completed",
      provider: "smokepay",
      provider_response: {
        source: "smoke_subaccount",
        shop_id: shopId,
        amount_reais: amountReais,
        smoke,
      },
      failure_reason: null,
      failed_at: null,
    })
    .eq("id", w.id)
    .select("*")
    .single();

  if (error || !updated) {
    console.error("[smoke-sub-wd] update completed:", error?.message);
    throw new AppError(
      500,
      "api_error",
      "Saque enviado à Smoke, mas falhou ao registrar o status. Confira no painel da Smoke."
    );
  }

  return mapWithdrawalRowForSmoke(updated);
}

export { publicWithdrawalView, getWithdrawal };
