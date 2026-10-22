import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";
import { createNexusPagWithdrawal } from "../providers/nexuspag.js";
import type { Environment } from "../types/index.js";
import { WITHDRAWAL_FEE_CENTS, WITHDRAWAL_MIN_CENTS } from "./withdrawal-fee.js";

export type WithdrawalStatus =
  | "pending"
  | "approved"
  | "processing"
  | "completed"
  | "rejected"
  | "failed";

export type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random" | "qrc";

export interface WithdrawalRequest {
  id: string;
  organization_id: string;
  environment: Environment;
  amount: number;
  fee: number;
  net: number;
  currency: string;
  pix_key: string;
  pix_key_type: PixKeyType;
  status: WithdrawalStatus;
  requested_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  failed_at: string | null;
  correlation_id: string | null;
  provider_reference: string | null;
  failure_reason: string | null;
  balance_transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapWithdrawalRow(row: any): WithdrawalRequest {
  return {
    ...row,
    fee: Number(row.fee ?? row.fee_amount ?? 0),
    net: Number(row.net ?? row.net_amount ?? 0),
    approved_by: row.approved_by ?? row.reviewed_by ?? null,
    approved_at: row.approved_at ?? row.reviewed_at ?? null,
    provider_reference: row.provider_reference ?? row.provider_withdrawal_id ?? null,
  } as WithdrawalRequest;
}

const MIN_WITHDRAWAL_CENTS = WITHDRAWAL_MIN_CENTS;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function recordWithdrawalDecision(params: {
  withdrawalId: string;
  organizationId: string;
  action: "approve" | "reject" | "process" | "fail";
  actorId?: string | null;
  reason?: string | null;
  stateBefore: string;
  stateAfter: string;
}): Promise<void> {
  try {
    await supabaseAdmin.from("withdrawal_decision_audit").insert({
      withdrawal_id: params.withdrawalId,
      organization_id: params.organizationId,
      action: params.action,
      actor_id: params.actorId || null,
      reason: params.reason || null,
      state_before: params.stateBefore,
      state_after: params.stateAfter,
    });
  } catch (err) {
    console.error("[withdrawals] audit failed:", err);
  }
}

function maskPixKey(key: string, type: PixKeyType): string {
  if (type === "email") {
    const [user, domain] = key.split("@");
    if (!domain) return "***";
    return `${(user || "").slice(0, 2)}***@${domain}`;
  }
  if (type === "cpf" || type === "cnpj" || type === "phone") {
    const digits = key.replace(/\D/g, "");
    if (digits.length < 4) return "***";
    return `***${digits.slice(-4)}`;
  }
  if (key.length <= 8) return "***";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function assertPixKey(type: PixKeyType, key: string): void {
  const k = key.trim();
  if (!k) throw new AppError(400, "validation_error", "Informe a chave PIX de destino.");
  switch (type) {
    case "cpf": {
      if (k.replace(/\D/g, "").length !== 11)
        throw new AppError(400, "validation_error", "CPF deve ter 11 digitos.");
      break;
    }
    case "cnpj": {
      if (k.replace(/\D/g, "").length !== 14)
        throw new AppError(400, "validation_error", "CNPJ deve ter 14 digitos.");
      break;
    }
    case "email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k))
        throw new AppError(400, "validation_error", "E-mail da chave PIX invalido.");
      break;
    case "phone": {
      const d = k.replace(/\D/g, "");
      if (d.length < 10 || d.length > 13)
        throw new AppError(400, "validation_error", "Telefone da chave PIX invalido.");
      break;
    }
    case "random":
      if (k.length < 8) throw new AppError(400, "validation_error", "Chave aleatoria invalida.");
      break;
    case "qrc":
      if (k.length < 20) throw new AppError(400, "validation_error", "PIX copia-e-cola invalido.");
      break;
  }
}

/**
 * Regra financeira do saque (fee-on-top):
 * - amountCents (entrada do usuário) = valor que o destinatário recebe (net).
 * - fee = WITHDRAWAL_FEE_CENTS (fixa).
 * - total reservado no saldo = amountCents + fee.
 * - Colunas persistidas: amount = total, net = valor ao destinatário, fee = taxa.
 * - Provider recebe sempre `net`.
 * - Available (sum net do ledger) cai pelo total (amount).
 *
 * Fluxo com aprovação obrigatória do ADM:
 * 1) Usuário solicita → status pending (saldo reservado, dinheiro NÃO sai).
 * 2) ADM aprova → approveAndExecuteWithdrawal envia ao adquirente.
 * 3) ADM rejeita → saldo é liberado de volta; dinheiro não sai.
 */
export async function requestWithdrawal(params: {
  organizationId: string;
  environment: Environment;
  userId: string;
  amountCents: number;
  pixKey: string;
  pixKeyType: PixKeyType;
  correlationId?: string;
}): Promise<WithdrawalRequest> {
  if (params.environment !== "live") {
    throw new AppError(
      400,
      "invalid_request",
      "Saques so estao disponiveis no ambiente de producao. Alterne para Producao no painel."
    );
  }

  if (!params.amountCents || params.amountCents < MIN_WITHDRAWAL_CENTS) {
    throw new AppError(
      400,
      "validation_error",
      `O valor minimo de saque e R$ ${(MIN_WITHDRAWAL_CENTS / 100).toFixed(2).replace(".", ",")}.`
    );
  }

  assertPixKey(params.pixKeyType, params.pixKey);

  const { data: orgKyc } = await supabaseAdmin
    .from("organizations")
    .select("kyc_required, kyc_status")
    .eq("id", params.organizationId)
    .maybeSingle();

  if (orgKyc?.kyc_required === true && orgKyc.kyc_status !== "verified") {
    throw new AppError(
      403,
      "kyc_required",
      "Complete a verificacao de identidade antes de solicitar saques."
    );
  }

  const correlationId = params.correlationId?.trim();
  if (!correlationId) {
    throw new AppError(
      400,
      "validation_error",
      "Informe correlation_id para garantir idempotencia do pedido de saque."
    );
  }
  if (!UUID_RE.test(correlationId)) {
    throw new AppError(
      400,
      "validation_error",
      "correlation_id deve ser um UUID valido."
    );
  }

  const feeAmount = WITHDRAWAL_FEE_CENTS;
  // Valor que o usuário quer receber / enviado ao provider (após aprovação ADM).
  const netAmount = params.amountCents;
  // Total debitado/reservado na carteira (fee cobrada além do solicitado).
  const totalAmount = params.amountCents + feeAmount;

  const { data, error } = await supabaseAdmin.rpc("fluxpay_create_withdrawal_request", {
    p_organization_id: params.organizationId,
    p_environment: params.environment,
    p_user_id: params.userId,
    p_amount: totalAmount,
    p_fee_amount: feeAmount,
    p_net_amount: netAmount,
    p_pix_key: params.pixKey.trim(),
    p_pix_key_type: params.pixKeyType,
    p_correlation_id: correlationId,
    p_description: `Saque solicitado (${maskPixKey(params.pixKey, params.pixKeyType)})`,
  });

  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    const msg = (error?.message || "").toLowerCase();
    if (error?.code === "23514") {
      if (msg.includes("insufficient") || msg.includes("saldo") || msg.includes("balance")) {
        console.error("[withdrawals] insufficient funds:", {
          organizationId: params.organizationId,
          requestedNet: netAmount,
          fee: feeAmount,
          total: totalAmount,
          code: error.code,
        });
        throw new AppError(
          400,
          "insufficient_funds",
          "Saldo disponivel insuficiente para o valor solicitado mais a taxa de saque."
        );
      }
      console.error("[withdrawals] amount consistency violation:", {
        organizationId: params.organizationId,
        requestedNet: netAmount,
        fee: feeAmount,
        total: totalAmount,
        code: error.code,
        message: error.message,
      });
      throw new AppError(
        400,
        "validation_error",
        "Valor de saque, taxa e valor liquido inconsistentes. Tente novamente ou contate o suporte."
      );
    }
    if (error?.code === "23505") {
      throw new AppError(409, "conflict", "O correlation_id ja pertence a outro pedido de saque.");
    }
    if (error?.code === "22023") {
      throw new AppError(400, "validation_error", "Dados invalidos para o pedido de saque.");
    }
    if (error?.code === "23503") {
      throw new AppError(400, "validation_error", "Organizacao ou usuario do saque nao encontrado.");
    }
    console.error("[withdrawals] atomic reservation failed:", {
      code: error?.code,
      message: error?.message,
      organizationId: params.organizationId,
      totalAmount,
      netAmount,
      feeAmount,
    });
    throw new AppError(503, "api_error", "Nao foi possivel reservar o saldo e registrar o saque atomicamente.");
  }

  // Retorna pending: dinheiro só sai quando o ADM aprovar em /admin/withdrawals.
  return mapWithdrawalRow(row);
}

export async function getWithdrawalByCorrelation(
  organizationId: string,
  environment: Environment,
  correlationId: string
): Promise<WithdrawalRequest | null> {
  const { data } = await supabaseAdmin
    .from("withdrawal_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .eq("correlation_id", correlationId)
    .maybeSingle();
  return data ? mapWithdrawalRow(data) : null;
}

export async function getWithdrawal(
  organizationId: string,
  environment: Environment,
  id: string
): Promise<WithdrawalRequest> {
  const { data, error } = await supabaseAdmin
    .from("withdrawal_requests")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .maybeSingle();

  if (error || !data) {
    throw new AppError(404, "not_found", "Pedido de saque nao encontrado.");
  }
  return mapWithdrawalRow(data);
}

export async function listWithdrawals(
  organizationId: string,
  environment: Environment,
  options: { limit?: number; status?: string } = {}
): Promise<{ data: WithdrawalRequest[]; has_more: boolean }> {
  const limit = Math.min(options.limit || 20, 100);
  let query = supabaseAdmin
    .from("withdrawal_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (options.status) query = query.eq("status", options.status);

  const { data, error } = await query;
  if (error) throw new AppError(500, "api_error", "Nao foi possivel listar os saques.");

  const rows = (data || []).map(mapWithdrawalRow);
  return { data: rows.slice(0, limit), has_more: rows.length > limit };
}

export async function listAllWithdrawals(options: {
  status?: string;
  limit?: number;
  organizationId?: string;
}): Promise<WithdrawalRequest[]> {
  const limit = Math.min(options.limit || 50, 100);
  let query = supabaseAdmin
    .from("withdrawal_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options.status) query = query.eq("status", options.status);
  if (options.organizationId) query = query.eq("organization_id", options.organizationId);

  const { data, error } = await query;
  if (error) throw new AppError(500, "api_error", "Nao foi possivel listar os saques.");
  return (data || []).map(mapWithdrawalRow);
}

export async function rejectWithdrawal(params: {
  withdrawalId: string;
  adminUserId: string;
  reason: string;
}): Promise<WithdrawalRequest> {
  const { data, error } = await supabaseAdmin.rpc("fluxpay_reject_withdrawal", {
    p_withdrawal_id: params.withdrawalId,
    p_admin_user_id: params.adminUserId,
    p_reason: params.reason,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    if (error?.code === "P0002") throw new AppError(404, "not_found", "Pedido de saque nao encontrado.");
    if (error?.code === "55000") throw new AppError(409, "conflict", "O saque nao esta pendente e nao pode ser rejeitado.");
    console.error("[withdrawals] atomic rejection failed:", error);
    throw new AppError(503, "api_error", "Nao foi possivel rejeitar e liberar o saldo atomicamente.");
  }

  return mapWithdrawalRow(row);
}

export async function approveAndExecuteWithdrawal(params: {
  withdrawalId: string;
  adminUserId: string;
  note?: string;
}): Promise<WithdrawalRequest> {
  const { data: row, error } = await supabaseAdmin
    .from("withdrawal_requests")
    .select("*")
    .eq("id", params.withdrawalId)
    .maybeSingle();

  if (error || !row) throw new AppError(404, "not_found", "Pedido de saque nao encontrado.");
  let w = mapWithdrawalRow(row);

  if (w.status !== "pending" && w.status !== "approved") {
    throw new AppError(
      400,
      "invalid_request",
      `Pedido nao pode ser enviado ao adquirente no status atual (${w.status}).`
    );
  }

  if (!Number.isFinite(w.net) || w.net <= 0) {
    throw new AppError(
      500,
      "api_error",
      "Pedido de saque sem valor liquido valido; reconcilie antes de enviar ao adquirente."
    );
  }

  const stateBeforeApprove = w.status;

  if (w.status === "pending") {
    const { data: approved, error: approveError } = await supabaseAdmin
      .from("withdrawal_requests")
      .update({
        status: "approved",
        approved_by: params.adminUserId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", w.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

    if (approveError || !approved) {
      throw new AppError(
        409,
        "conflict",
        "O pedido de saque foi alterado por outra operação. Atualize o estado antes de tentar novamente."
      );
    }
    w = mapWithdrawalRow(approved);
  }

  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("withdrawal_requests")
    .update({ status: "processing" })
    .eq("id", w.id)
    .eq("status", "approved")
    .select("*")
    .maybeSingle();

  if (claimError || !claimed) {
    throw new AppError(
      409,
      "conflict",
      "O pedido de saque já foi assumido por outra operação ou precisa de reconciliação."
    );
  }
  w = mapWithdrawalRow(claimed);

  await recordWithdrawalDecision({
    withdrawalId: w.id,
    organizationId: w.organization_id,
    action: "approve",
    actorId: params.adminUserId,
    reason: params.note ?? null,
    stateBefore: stateBeforeApprove,
    stateAfter: "processing",
  });

  let providerResult;
  try {
    // Envia o valor líquido (o que o destinatário deve receber).
    providerResult = await createNexusPagWithdrawal({
      amountCents: w.net,
      pixKey: w.pix_key,
      pixKeyType: w.pix_key_type as PixKeyType,
      externalId: w.id,
    });
  } catch (err) {
    const e = err as Error & { code?: string; status?: number };
    const failureReason = e.message || "Falha no adquirente";
    const terminal = e.code === "requires_kyc" || e.code === "forbidden" || e.status === 400;

    await supabaseAdmin
      .from("withdrawal_requests")
      .update({
        status: terminal ? "failed" : "processing",
        failure_reason: failureReason,
        failed_at: terminal ? new Date().toISOString() : null,
      })
      .eq("id", w.id);

    if (e.code === "cooldown") {
      throw new AppError(429, "rate_limit_error", failureReason);
    }
    if (e.code === "requires_kyc") {
      throw new AppError(403, "provider_error", failureReason);
    }
    throw new AppError(502, "provider_error", failureReason);
  }

  const finalStatus = providerResult.status === "completed" ? "completed" : "processing";
  const providerRef =
    (providerResult as any).providerWithdrawalId || (providerResult as any).id || null;
  const feeCents = (providerResult as any).feeCents;

  const { data: updated, error: upErr } = await supabaseAdmin
    .from("withdrawal_requests")
    .update({
      status: finalStatus,
      provider_reference: providerRef,
      fee: typeof feeCents === "number" ? feeCents : w.fee,
      failure_reason: null,
      failed_at: null,
    })
    .eq("id", w.id)
    .select("*")
    .single();

  if (upErr || !updated) {
    console.error("[withdrawals] update pos-provider falhou:", upErr);
    throw new AppError(
      500,
      "api_error",
      "Saque enviado ao adquirente, mas falhou ao registrar o status. Consulte o historico antes de retentar."
    );
  }

  return mapWithdrawalRow(updated);
}

export function publicWithdrawalView(w: WithdrawalRequest) {
  return {
    id: w.id,
    amount: w.amount,
    fee_amount: w.fee,
    net_amount: w.net,
    currency: w.currency,
    pix_key_masked: maskPixKey(w.pix_key, w.pix_key_type as PixKeyType),
    pix_key_type: w.pix_key_type,
    status: w.status,
    rejection_reason: w.rejection_reason,
    failure_reason: w.failure_reason,
    correlation_id: w.correlation_id,
    created_at: w.created_at,
    updated_at: w.updated_at,
    reviewed_at: w.approved_at,
  };
}
