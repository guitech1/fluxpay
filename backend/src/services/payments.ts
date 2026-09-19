import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../config/supabase.js";
import { getProvider } from "../providers/index.js";
import { AppError } from "../middleware/error.js";
import { dispatchWebhook } from "./webhooks.js";
import { env } from "../config/env.js";
import type {
  CreatePaymentInput,
  Payment,
  Environment,
  CreateRefundInput,
} from "../types/index.js";

export async function createPayment(
  organizationId: string,
  environment: Environment,
  input: CreatePaymentInput
): Promise<Payment> {
  if (!input.amount || input.amount <= 0) {
    throw new AppError(400, "validation_error", "Amount must be a positive integer (in cents).");
  }

  const currency = (input.currency || "BRL").toUpperCase();
  const provider = getProvider(environment);
  const paymentType = input.payment_method?.type === "pix" ? "pix" : "card";

  const paymentId = uuidv4();

  // Call the isolated provider layer. Para PIX, repassamos os campos extras
  // que a NexusPag exige (webhook_url, external_id, expiracao); providers de
  // cartao simplesmente ignoram esses campos.
  const providerResult = await provider.createPayment({
    amount: input.amount,
    currency,
    paymentMethodToken: input.payment_method?.token,
    metadata: input.metadata,
    description: input.description,
    externalId: input.idempotency_key || paymentId,
    webhookUrl: `${env.API_BASE_URL}/v1/webhooks/nexuspag`,
    expirationSeconds: paymentType === "pix" ? 3600 : undefined,
  });

  // Simple fee calculation example (1.5% + fixed) — para PIX, usamos a taxa
  // que a propria NexusPag devolveu (providerResult.pix), quando disponivel.
  const feeAmount = providerResult.pix?.feeAmountCents ?? Math.round(input.amount * 0.015) + 50;
  const netAmount = providerResult.pix?.netAmountCents ?? input.amount - feeAmount;

  const { data: payment, error } = await supabaseAdmin
    .from("payments")
    .insert({
      id: paymentId,
      organization_id: organizationId,
      customer_id: input.customer_id || null,
      environment,
      amount: input.amount,
      currency,
      status: providerResult.status,
      description: input.description || null,
      idempotency_key: input.idempotency_key || null,
      provider: provider.name,
      provider_payment_id: providerResult.providerPaymentId,
      provider_response: providerResult.rawResponse,
      fee_amount: feeAmount,
      net_amount: netAmount,
      metadata: input.metadata || {},
      payment_type: paymentType,
      provider_txid: providerResult.pix?.txid || null,
      provider_external_id: input.idempotency_key || null,
      pix_copy_paste: providerResult.pix?.copyPaste || null,
      pix_qr_code_base64: providerResult.pix?.qrCodeBase64 || null,
      expires_at: providerResult.pix?.expiresAt || null,
      authorized_at: providerResult.status === "succeeded" ? new Date().toISOString() : null,
      captured_at: providerResult.status === "succeeded" ? new Date().toISOString() : null,
      failed_at: providerResult.status === "failed" ? new Date().toISOString() : null,
      paid_at: providerResult.status === "succeeded" ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) {
    console.error("Create payment error:", error);
    throw new AppError(500, "api_error", "Failed to create payment.");
  }

  // Ledger entry for successful payments
  if (payment.status === "succeeded") {
    await supabaseAdmin.from("balance_transactions").insert({
      organization_id: organizationId,
      environment,
      type: "charge",
      amount: input.amount,
      currency,
      net: netAmount,
      fee: feeAmount,
      payment_id: payment.id,
      description: input.description || "Payment",
      available_on: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // T+2
    });
  }

  // Dispatch webhooks asynchronously
  const eventType =
    payment.status === "succeeded"
      ? "payment.succeeded"
      : payment.status === "failed"
        ? "payment.failed"
        : payment.status === "pending"
          ? "payment.pending"
          : "payment.created";

  dispatchWebhook(organizationId, environment, eventType, payment).catch(console.error);

  return payment as Payment;
}

export async function getPayment(
  organizationId: string,
  paymentId: string
): Promise<Payment> {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    throw new AppError(404, "not_found", "Payment not found.");
  }

  return data as Payment;
}

export async function listPayments(
  organizationId: string,
  environment: Environment,
  options: { limit?: number; starting_after?: string; status?: string } = {}
): Promise<{ data: Payment[]; has_more: boolean }> {
  const limit = Math.min(options.limit || 20, 100);

  let query = supabaseAdmin
    .from("payments")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (options.status) {
    query = query.eq("status", options.status);
  }

  if (options.starting_after) {
    const { data: cursor } = await supabaseAdmin
      .from("payments")
      .select("created_at")
      .eq("id", options.starting_after)
      .single();
    if (cursor) {
      query = query.lt("created_at", cursor.created_at);
    }
  }

  const { data, error } = await query;

  if (error) {
    throw new AppError(500, "api_error", "Failed to list payments.");
  }

  const hasMore = (data?.length || 0) > limit;
  const results = (data || []).slice(0, limit) as Payment[];

  return { data: results, has_more: hasMore };
}

export async function cancelPayment(
  organizationId: string,
  paymentId: string
): Promise<Payment> {
  const payment = await getPayment(organizationId, paymentId);

  if (!["pending", "processing"].includes(payment.status)) {
    throw new AppError(400, "invalid_request", "Only pending or processing payments can be canceled.");
  }

  const { data, error } = await supabaseAdmin
    .from("payments")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
    })
    .eq("id", paymentId)
    .eq("organization_id", organizationId)
    .select()
    .single();

  if (error || !data) {
    throw new AppError(500, "api_error", "Failed to cancel payment.");
  }

  dispatchWebhook(organizationId, payment.environment, "payment.canceled", data).catch(console.error);

  return data as Payment;
}

export async function createRefund(
  organizationId: string,
  paymentId: string,
  input: CreateRefundInput
): Promise<unknown> {
  const payment = await getPayment(organizationId, paymentId);

  if (!["succeeded", "partially_refunded"].includes(payment.status)) {
    throw new AppError(400, "invalid_request", "Only succeeded payments can be refunded.");
  }

  const refundAmount = input.amount ?? payment.amount;

  if (refundAmount <= 0 || refundAmount > payment.amount) {
    throw new AppError(400, "validation_error", "Invalid refund amount.");
  }

  const provider = getProvider(payment.environment);
  const providerResult = await provider.refundPayment({
    providerPaymentId: payment.provider_payment_id!,
    amount: refundAmount,
  });

  const { data: refund, error } = await supabaseAdmin
    .from("refunds")
    .insert({
      organization_id: organizationId,
      payment_id: paymentId,
      environment: payment.environment,
      amount: refundAmount,
      currency: payment.currency,
      status: providerResult.status,
      reason: input.reason || null,
      provider_refund_id: providerResult.providerRefundId,
      provider_response: providerResult.rawResponse,
      metadata: input.metadata || {},
    })
    .select()
    .single();

  if (error) {
    throw new AppError(500, "api_error", "Failed to create refund.");
  }

  // Update payment status
  const newStatus = refundAmount >= payment.amount ? "refunded" : "partially_refunded";
  await supabaseAdmin
    .from("payments")
    .update({ status: newStatus })
    .eq("id", paymentId);

  // Ledger
  await supabaseAdmin.from("balance_transactions").insert({
    organization_id: organizationId,
    environment: payment.environment,
    type: "refund",
    amount: -refundAmount,
    currency: payment.currency,
    net: -refundAmount,
    fee: 0,
    payment_id: paymentId,
    refund_id: refund.id,
    description: input.reason || "Refund",
  });

  dispatchWebhook(organizationId, payment.environment, "payment.refunded", {
    payment,
    refund,
  }).catch(console.error);

  return refund;
}

// ============================================================
// Confirmacao assincrona de PIX — chamada pelo webhook de entrada
// da NexusPag (routes/webhooks.ts -> POST /v1/webhooks/nexuspag).
// Cartao confirma na hora (createPayment); PIX so confirma quando
// o adquirente avisa que o cliente pagou.
// ============================================================

export async function getPaymentByProviderTxid(txid: string): Promise<Payment | null> {
  const { data } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("provider_txid", txid)
    .maybeSingle();
  return (data as Payment) || null;
}

export async function markPixPaymentSucceeded(payment: Payment): Promise<void> {
  if (payment.status === "succeeded") return; // idempotente

  const { data: updated, error } = await supabaseAdmin
    .from("payments")
    .update({
      status: "succeeded",
      paid_at: new Date().toISOString(),
      captured_at: new Date().toISOString(),
    })
    .eq("id", payment.id)
    .select()
    .single();

  if (error || !updated) {
    console.error("Falha ao confirmar PIX:", error);
    return;
  }

  await supabaseAdmin.from("balance_transactions").insert({
    organization_id: payment.organization_id,
    environment: payment.environment,
    type: "charge",
    amount: payment.amount,
    currency: payment.currency,
    net: payment.net_amount ?? payment.amount - payment.fee_amount,
    fee: payment.fee_amount,
    payment_id: payment.id,
    description: payment.description || "Pagamento PIX",
    available_on: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
  });

  dispatchWebhook(payment.organization_id, payment.environment, "payment.succeeded", updated).catch(
    console.error
  );
}

/**
 * Confirma uma cobranca PIX SIMULADA a partir do painel (ambiente de teste).
 *
 * Mesmas travas da versao do checkout: environment "test" E provider
 * "sandbox". Qualquer outra combinacao responde 404 — inclusive uma cobranca
 * real em producao, que so o webhook da NexusPag confirma.
 */
export async function simulateSandboxPayment(
  organizationId: string,
  paymentId: string
): Promise<Payment> {
  const payment = await getPayment(organizationId, paymentId);

  if (payment.environment !== "test" || payment.provider !== "sandbox") {
    throw new AppError(404, "not_found", "Recurso nao encontrado.");
  }

  if (payment.status === "succeeded") return payment;

  if (payment.status !== "pending") {
    throw new AppError(409, "invalid_request", "Esta cobranca nao esta mais pendente.");
  }

  await markPixPaymentSucceeded(payment);

  return getPayment(organizationId, paymentId);
}

export async function markPixPaymentFailedOrExpired(
  payment: Payment,
  reason: "failed" | "expired"
): Promise<void> {
  if (["succeeded", "failed", "expired"].includes(payment.status)) return; // idempotente

  const { data: updated, error } = await supabaseAdmin
    .from("payments")
    .update({
      status: reason,
      failed_at: reason === "failed" ? new Date().toISOString() : null,
      expired_at: reason === "expired" ? new Date().toISOString() : null,
    })
    .eq("id", payment.id)
    .select()
    .single();

  if (error || !updated) return;

  dispatchWebhook(
    payment.organization_id,
    payment.environment,
    reason === "failed" ? "payment.failed" : "payment.canceled",
    updated
  ).catch(console.error);
}
