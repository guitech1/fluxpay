import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";
import { createNexusPagWithdrawal } from "../providers/nexuspag.js";
import { getBalance } from "./balance.js";
import type { Environment } from "../types/index.js";

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
  fee_amount: number;
  net_amount: number;
  currency: string;
  pix_key: string;
  pix_key_type: PixKeyType;
  status: WithdrawalStatus;
  requested_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  review_note: string | null;
  correlation_id: string | null;
  provider: string | null;
  provider_withdrawal_id: string | null;
  provider_response: unknown;
  provider_status: string | null;
  failure_reason: string | null;
  balance_transaction_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const MIN_WITHDRAWAL_CENTS = 1000;

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

  const correlationId = params.correlationId?.trim() || uuidv4();
  const requestId = uuidv4();
  const feeAmount = 0;
  const netAmount = params.amountCents - feeAmount;

  const { data: ledger, error: ledgerError } = await supabaseAdmin
    .from("balance_transactions")
    .insert({
      organization_id: params.organizationId,
      environment: params.environment,
      type: "payout",
      amount: -params.amountCents,
      currency: "BRL",
      net: -netAmount,
      fee: feeAmount,
      description: `Saque solicitado (${maskPixKey(params.pixKey, params.pixKeyType)})`,
      available_on: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (ledgerError || !ledger) {
    console.error("[withdrawals] ledger insert failed:", ledgerError);
    throw new AppError(500, "api_error", "Nao foi possivel reservar o saldo para o saque.");
  }

  const { data: row, error: insertError } = await supabaseAdmin
    .from("withdrawal_requests")
    .insert({
      id: requestId,
      organization_id: params.organizationId,
      environment: params.environment,
      amount: params.amountCents,
      fee_amount: feeAmount,
      net_amount: netAmount,
      currency: "BRL",
      pix_key: params.pixKey.trim(),
      pix_key_type: params.pixKeyType,
      status: "pending",
      requested_by: params.userId,
      correlation_id: correlationId,
      balance_transaction_id: ledger.id,
      metadata: {},
    })
    .select("*")
    .single();

  if (insertError) {
    await supabaseAdmin.from("balance_transactions").delete().eq("id", ledger.id);
    if (insertError.code === "23505") {
      const existing = await getWithdrawalByCorrelation(
        params.organizationId,
        params.environment,
        correlationId
      );
      if (existing) return existing;
      throw new AppError(409, "conflict", "Ja existe um saque com esta referencia.");
    }
    console.error("[withdrawals] insert failed:", insertError);
    throw new AppError(500, "api_error", "Nao foi possivel registrar o pedido de saque.");
  }

  return row as WithdrawalRequest;
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
  return (data as WithdrawalRequest) || null;
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
  return data as WithdrawalRequest;
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

  const rows = (data || []) as WithdrawalRequest[];
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
  return (data || []) as WithdrawalRequest[];
}

export async function rejectWithdrawal(params: {
  withdrawalId: string;
  adminUserId: string;
  reason: string;
}): Promise<WithdrawalRequest> {
  const { data: row, error } = await supabaseAdmin
    .from("withdrawal_requests")
    .select("*")
    .eq("id", params.withdrawalId)
    .maybeSingle();

  if (error || !row) throw new AppError(404, "not_found", "Pedido de saque nao encontrado.");
  const w = row as WithdrawalRequest;

  if (w.status !== "pending") {
    throw new AppError(
      400,
      "invalid_request",
      `So e possivel rejeitar pedidos pendentes (atual: ${w.status}).`
    );
  }

  await supabaseAdmin.from("balance_transactions").insert({
    organization_id: w.organization_id,
    environment: w.environment,
    type: "adjustment",
    amount: w.amount,
    currency: w.currency,
    net: w.net_amount,
    fee: 0,
    description: `Estorno de saque rejeitado (${w.id.slice(0, 8)})`,
    available_on: new Date().toISOString(),
  });

  const { data: updated, error: upErr } = await supabaseAdmin
    .from("withdrawal_requests")
    .update({
      status: "rejected",
      reviewed_by: params.adminUserId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: params.reason,
    })
    .eq("id", w.id)
    .eq("status", "pending")
    .select("*")
    .single();

  if (upErr || !updated) {
    throw new AppError(500, "api_error", "Nao foi possivel rejeitar o saque.");
  }
  return updated as WithdrawalRequest;
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
  const w = row as WithdrawalRequest;

  if (w.status !== "pending" && w.status !== "approved") {
    throw new AppError(
      400,
      "invalid_request",
      `Pedido nao pode ser enviado ao adquirente no status atual (${w.status}).`
    );
  }

  await supabaseAdmin
    .from("withdrawal_requests")
    .update({
      status: "approved",
      reviewed_by: params.adminUserId,
      reviewed_at: new Date().toISOString(),
      review_note: params.note || null,
    })
    .eq("id", w.id)
    .in("status", ["pending", "approved"]);

  let providerResult;
  try {
    providerResult = await createNexusPagWithdrawal({
      amountCents: w.net_amount,
      pixKey: w.pix_key,
      pixKeyType: w.pix_key_type as PixKeyType,
    });
  } catch (err) {
    const e = err as Error & { code?: string; status?: number };
    const failureReason = e.message || "Falha no adquirente";
    const terminal = e.code === "requires_kyc" || e.code === "forbidden" || e.status === 400;

    await supabaseAdmin
      .from("withdrawal_requests")
      .update({
        status: terminal ? "failed" : "processing",
        provider: "nexuspag",
        failure_reason: failureReason,
        provider_response: { error: failureReason, code: e.code, status: e.status },
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

  const { data: updated, error: upErr } = await supabaseAdmin
    .from("withdrawal_requests")
    .update({
      status: finalStatus,
      provider: "nexuspag",
      provider_withdrawal_id: providerResult.providerWithdrawalId,
      provider_status: providerResult.status,
      provider_response: providerResult.rawResponse,
      fee_amount: providerResult.feeCents,
      failure_reason: null,
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

  return updated as WithdrawalRequest;
}

export function publicWithdrawalView(w: WithdrawalRequest) {
  return {
    id: w.id,
    amount: w.amount,
    fee_amount: w.fee_amount,
    net_amount: w.net_amount,
    currency: w.currency,
    pix_key_masked: maskPixKey(w.pix_key, w.pix_key_type as PixKeyType),
    pix_key_type: w.pix_key_type,
    status: w.status,
    rejection_reason: w.rejection_reason,
    failure_reason: w.failure_reason,
    correlation_id: w.correlation_id,
    created_at: w.created_at,
    updated_at: w.updated_at,
    reviewed_at: w.reviewed_at,
  };
}
