import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../config/supabase.js";
import {
  getProvider,
  createChargeWithFailover,
} from "../providers/index.js";
import { AppError } from "../middleware/error.js";
import { dispatchWebhook } from "./webhooks.js";
import { inScopeOrNull } from "../utils/scope.js";
import { decideReconcileAction, decideWebhookAction } from "./provider-events.js";
import { env } from "../config/env.js";
import { calculateFee } from "./fees.js";
import type {
  CreatePaymentInput,
  Payment,
  Environment,
  CreateRefundInput,
} from "../types/index.js";
import type { AcquirerId, FeeRuleSnapshot } from "../providers/types.js";

/**
 * Cria uma cobranca com roteamento multi-adquirente e failover.
 *
 * ORDEM DAS OPERACOES:
 *
 *   1. grava a linha em `payments` — status pending, sem txid;
 *   2. calcula taxa (regras org/global + custo do adquirente) e snapshot;
 *   3. chama createChargeWithFailover (GothamPay, SmokePay, KavroPay, NexusPag);
 *   4. grava txid, QR Code, taxas e fee_rule_snapshot na mesma linha.
 *
 * Idempotencia:
 *   - UNIQUE(organization_id, environment, idempotency_key) na migration 013;
 *   - external_id = id local (UUID) para o adquirente.
 *
 * Failover:
 *   - so tenta outro provedor quando o erro e retryable e NAO ambiguo;
 *   - resultado ambiguo (timeout/502) deixa a linha pendente para reconciliacao;
 *   - nao repete cobranca em outro provedor quando o resultado anterior for ambiguo.
 *
 * Liquidacao:
 *   - vendas confirmadas creditam no ledger na confirmacao;
 *   - available_on = agora (sem atraso artificial T+2);
 *   - saldo disponivel vs pendente controlado por available_on e aprovacao de saque.
 */
export async function createPayment(
  organizationId: string,
  environment: Environment,
  input: CreatePaymentInput
): Promise<Payment> {
  if (!input.amount || input.amount <= 0) {
    throw new AppError(400, "validation_error", "Informe um valor valido para a cobranca.");
  }

  const currency = (input.currency || "BRL").toUpperCase();
  const paymentType = input.payment_method?.type === "pix" ? "pix" : "card";

  const paymentId = uuidv4();
  const providerExternalId = buildProviderExternalId(paymentId);

  // ---------- 1. Persistencia local primeiro ----------
  const { data: created, error: insertError } = await supabaseAdmin
    .from("payments")
    .insert({
      id: paymentId,
      organization_id: organizationId,
      customer_id: input.customer_id || null,
      environment,
      amount: input.amount,
      currency,
      status: "pending",
      description: input.description || null,
      idempotency_key: input.idempotency_key || null,
      provider: "pending",
      provider_external_id: providerExternalId,
      fee_amount: 0,
      net_amount: null,
      metadata: input.metadata || {},
      payment_type: paymentType,
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505" && input.idempotency_key) {
      const existing = await getPaymentByIdempotencyKey(
        organizationId,
        environment,
        input.idempotency_key
      );
      if (existing) return existing;
    }
    console.error("Create payment error (insert):", insertError);
    throw new AppError(500, "api_error", "Nao foi possivel registrar a cobranca. Tente novamente.");
  }

  // ---------- 2. Taxa (snapshot) ----------
  const preferredProviderId = (
    environment === "test" ? "sandbox" : "nexuspag"
  ) as AcquirerId;

  let feeCalc = await calculateFee({
    amountCents: input.amount,
    organizationId,
    providerId: preferredProviderId,
  });

  // ---------- 3. Adquirente com failover ----------
  const webhookUrl = `${env.API_BASE_URL}/v1/webhooks/provider`;

  let attemptResult;
  try {
    attemptResult = await createChargeWithFailover(
      {
        organizationId,
        amountCents: input.amount,
        currency,
        description: input.description,
        externalId: providerExternalId,
        webhookUrl,
        expirationSeconds: paymentType === "pix" ? input.expires_in_seconds || 3600 : undefined,
        metadata: input.metadata,
        attempt: 0,
        attemptedProviders: [],
      },
      environment
    );
  } catch (err) {
    console.error("[payments] createChargeWithFailover falhou:", {
      environment,
      organizationId,
      paymentId,
      error: err instanceof Error ? err.message : err,
    });
    if (err instanceof AppError) throw err;
    throw new AppError(
      502,
      "provider_error",
      "Nao foi possivel gerar a cobranca no momento. Tente novamente em instantes."
    );
  }

  if (!attemptResult.success) {
    if (attemptResult.ambiguous) {
      console.warn("[payments] resultado ambiguo — sem failover adicional:", {
        paymentId,
        providerId: attemptResult.providerId,
        error: attemptResult.errorMessage,
      });
      const { data: pendingRow } = await supabaseAdmin
        .from("payments")
        .update({
          provider: attemptResult.providerId,
          provider_response: {
            ambiguous: true,
            error: attemptResult.errorMessage,
            latencyMs: attemptResult.latencyMs,
          },
        })
        .eq("id", paymentId)
        .select()
        .single();
      if (pendingRow) {
        dispatchWebhook(organizationId, environment, "payment.pending", pendingRow).catch(console.error);
        return pendingRow as Payment;
      }
      throw new AppError(
        502,
        "provider_error",
        "Cobranca registrada localmente; confirmacao pendente de reconciliacao."
      );
    }

    const nowIso = new Date().toISOString();
    const { data: failedRow } = await supabaseAdmin
      .from("payments")
      .update({
        status: "failed",
        provider: attemptResult.providerId,
        failed_at: nowIso,
        provider_response: {
          error: attemptResult.errorMessage,
          errorCode: attemptResult.errorCode,
          latencyMs: attemptResult.latencyMs,
        },
      })
      .eq("id", paymentId)
      .select()
      .single();

    if (failedRow) {
      dispatchWebhook(organizationId, environment, "payment.failed", failedRow).catch(console.error);
      return failedRow as Payment;
    }

    throw new AppError(
      502,
      "provider_error",
      attemptResult.errorMessage || "Nao foi possivel gerar a cobranca no momento."
    );
  }

  const usedProviderId = attemptResult.providerId as AcquirerId;
  if (usedProviderId !== preferredProviderId) {
    feeCalc = await calculateFee({
      amountCents: input.amount,
      organizationId,
      providerId: usedProviderId,
    });
  }

  const feeAmount =
    attemptResult.pix?.feeAmountCents ?? feeCalc.feeAmountCents;
  const netAmount =
    attemptResult.pix?.netAmountCents ?? feeCalc.netAmountCents;
  const feeSnapshot: FeeRuleSnapshot = feeCalc.snapshot;

  const nowIso = new Date().toISOString();
  const providerStatus = attemptResult.status || "pending";
  // A provider's successful PIX response must not mark the payment paid before
  // the database RPC atomically changes status and inserts the ledger credit.
  const status =
    paymentType === "pix" && providerStatus === "succeeded"
      ? "processing"
      : providerStatus;

  const { data: payment, error: updateError } = await supabaseAdmin
    .from("payments")
    .update({
      status,
      provider: usedProviderId,
      provider_payment_id: attemptResult.providerPaymentId || null,
      provider_response: attemptResult.rawResponse ?? null,
      fee_amount: feeAmount,
      net_amount: netAmount,
      fee_rule_snapshot: feeSnapshot,
      provider_txid: attemptResult.pix?.txid || null,
      pix_copy_paste: attemptResult.pix?.copyPaste || null,
      pix_qr_code_base64: attemptResult.pix?.qrCodeBase64 || null,
      expires_at: attemptResult.pix?.expiresAt || null,
      authorized_at: status === "succeeded" ? nowIso : null,
      captured_at: status === "succeeded" ? nowIso : null,
      failed_at: status === "failed" ? nowIso : null,
      paid_at: status === "succeeded" ? nowIso : null,
    })
    .eq("id", paymentId)
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .select()
    .single();

  if (updateError || !payment) {
    console.error("Create payment error (update pos-provider):", {
      paymentId,
      providerExternalId,
      error: updateError,
    });
    throw new AppError(
      500,
      "api_error",
      "A cobranca foi criada, mas houve falha ao registra-la. Consulte em instantes antes de tentar de novo."
    );
  }

  let finalPayment = payment as Payment;

  if (providerStatus === "succeeded") {
    if (payment.payment_type === "pix") {
      // The RPC owns the succeeded transition and charge ledger insert in one transaction.
      const { data: confirmed, error: ledgerError } = await supabaseAdmin.rpc(
        "fluxpay_confirm_pix_payment",
        {
          p_payment_id: payment.id,
          p_organization_id: organizationId,
          p_environment: environment,
        }
      );

      const confirmedPayment = Array.isArray(confirmed) ? confirmed[0] : confirmed;
      if (ledgerError || !confirmedPayment) {
        console.error("Atomic PIX ledger confirmation failed:", {
          paymentId: payment.id,
          error: ledgerError,
        });
        throw new AppError(
          500,
          "api_error",
          "A cobranca foi aprovada pelo provedor, mas o registro financeiro esta pendente de reconciliacao."
        );
      }
      finalPayment = confirmedPayment as Payment;
    } else {
      // Non-PIX flows are not covered by the PIX-specific RPC.
      const { error: ledgerError } = await supabaseAdmin
        .from("balance_transactions")
        .insert({
          organization_id: organizationId,
          environment,
          type: "charge",
          amount: input.amount,
          currency,
          net: netAmount,
          fee: feeAmount,
          payment_id: payment.id,
          description: input.description || "Payment",
          available_on: nowIso,
        });

      if (ledgerError) {
        throw new AppError(
          500,
          "api_error",
          "A cobranca foi aprovada pelo provedor, mas o registro financeiro esta pendente de reconciliacao."
        );
      }
    }
  }

  const eventType =
    finalPayment.status === "succeeded"
      ? "payment.succeeded"
      : finalPayment.status === "failed"
        ? "payment.failed"
        : finalPayment.status === "pending"
          ? "payment.pending"
          : "payment.created";

  dispatchWebhook(organizationId, environment, eventType, finalPayment).catch(console.error);

  return finalPayment;
}

export function buildProviderExternalId(paymentId: string): string {
  return paymentId;
}

export async function getPaymentByIdempotencyKey(
  organizationId: string,
  environment: Environment,
  idempotencyKey: string
): Promise<Payment | null> {
  const { data } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  return inScopeOrNull(data as Payment | null, organizationId, environment);
}

export async function getPayment(
  organizationId: string,
  paymentId: string,
  environment: Environment
): Promise<Payment> {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .maybeSingle();

  const payment = inScopeOrNull(data as Payment | null, organizationId, environment);

  if (error || !payment) {
    throw new AppError(404, "not_found", "Cobranca nao encontrada.");
  }

  return payment;
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
      .eq("organization_id", organizationId)
      .eq("environment", environment)
      .maybeSingle();

    if (!cursor) {
      throw new AppError(400, "validation_error", "starting_after nao corresponde a uma cobranca deste ambiente.");
    }

    query = query.lt("created_at", cursor.created_at);
  }

  const { data, error } = await query;

  if (error) {
    throw new AppError(500, "api_error", "Nao foi possivel carregar as cobrancas.");
  }

  const hasMore = (data?.length || 0) > limit;
  const results = (data || []).slice(0, limit) as Payment[];

  return { data: results, has_more: hasMore };
}

export async function cancelPayment(
  organizationId: string,
  paymentId: string,
  environment: Environment
): Promise<Payment> {
  const payment = await getPayment(organizationId, paymentId, environment);

  if (!["pending", "processing"].includes(payment.status)) {
    throw new AppError(400, "invalid_request", "So e possivel cancelar uma cobranca que ainda esta pendente.");
  }

  const { data, error } = await supabaseAdmin
    .from("payments")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
    })
    .eq("id", paymentId)
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .select()
    .single();

  if (error || !data) {
    throw new AppError(500, "api_error", "Nao foi possivel cancelar a cobranca. Tente novamente.");
  }

  dispatchWebhook(organizationId, payment.environment, "payment.canceled", data).catch(console.error);

  return data as Payment;
}

export async function createRefund(
  organizationId: string,
  paymentId: string,
  environment: Environment,
  input: CreateRefundInput
): Promise<unknown> {
  const payment = await getPayment(organizationId, paymentId, environment);

  if (!["succeeded", "partially_refunded"].includes(payment.status)) {
    throw new AppError(400, "invalid_request", "So e possivel reembolsar uma cobranca ja aprovada.");
  }

  // NexusPag's current PIX adapter explicitly does not support refunds. Reject
  // before any provider call or local ledger mutation instead of surfacing a
  // generic 500 after attempting an unsupported operation.
  if (payment.payment_type === "pix" && payment.provider === "nexuspag") {
    throw new AppError(
      501,
      "provider_error",
      "Reembolso de PIX pela NexusPag não é suportado pela API atual."
    );
  }

  const refundAmount = input.amount ?? payment.amount;

  if (refundAmount <= 0 || refundAmount > payment.amount) {
    throw new AppError(400, "validation_error", "Valor de reembolso invalido.");
  }

  const provider = getProvider(payment.environment, payment.provider ?? undefined);
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
    throw new AppError(500, "api_error", "Nao foi possivel registrar o reembolso. Tente novamente.");
  }

  const newStatus = refundAmount >= payment.amount ? "refunded" : "partially_refunded";
  await supabaseAdmin
    .from("payments")
    .update({ status: newStatus })
    .eq("id", paymentId);

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

export async function getPaymentByProviderReference(reference: {
  txid?: string | null;
  externalId?: string | null;
}): Promise<Payment | null> {
  if (reference.txid) {
    const { data } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("provider_txid", reference.txid)
      .maybeSingle();
    if (data) return data as Payment;
  }

  if (reference.externalId) {
    const { data } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("provider_external_id", reference.externalId)
      .maybeSingle();
    if (data) return data as Payment;
  }

  return null;
}

export async function getPaymentByProviderTxid(txid: string): Promise<Payment | null> {
  return getPaymentByProviderReference({ txid });
}

export async function markPixPaymentSucceeded(payment: Payment): Promise<void> {
  const { data: updated, error } = await supabaseAdmin.rpc(
    "fluxpay_confirm_pix_payment",
    {
      p_payment_id: payment.id,
      p_organization_id: payment.organization_id,
      p_environment: payment.environment,
    }
  );

  if (error || !updated) {
    console.error("Falha ao confirmar PIX:", error);
    throw new Error("Falha ao confirmar pagamento PIX");
  }

  const confirmedPayment = Array.isArray(updated) ? updated[0] : updated;

  dispatchWebhook(
    payment.organization_id,
    payment.environment,
    "payment.succeeded",
    confirmedPayment
  ).catch(console.error);
}

export async function simulateSandboxPayment(
  organizationId: string,
  paymentId: string
): Promise<Payment> {
  const payment = await getPayment(organizationId, paymentId, "test");

  if (payment.environment !== "test" || payment.provider !== "sandbox") {
    throw new AppError(404, "not_found", "Recurso nao encontrado.");
  }

  if (payment.status === "succeeded") return payment;

  if (payment.status !== "pending") {
    throw new AppError(409, "invalid_request", "Esta cobranca nao esta mais pendente.");
  }

  await markPixPaymentSucceeded(payment);

  return getPayment(organizationId, paymentId, "test");
}

export async function markPixPaymentFailedOrExpired(
  payment: Payment,
  reason: "failed" | "expired"
): Promise<void> {
  if (["succeeded", "failed", "expired"].includes(payment.status)) return;

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

const ORPHAN_GRACE_SECONDS = 5 * 60;

export async function reconcileOrphanPixCharges(): Promise<{
  checked: number;
  confirmed: number;
  attached: number;
  failed: number;
}> {
  const cutoff = new Date(Date.now() - ORPHAN_GRACE_SECONDS * 1000).toISOString();

  const { data: orphans, error } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("status", "pending")
    .eq("payment_type", "pix")
    .is("provider_txid", null)
    .lt("created_at", cutoff)
    .limit(50);

  const result = { checked: 0, confirmed: 0, attached: 0, failed: 0 };

  if (error) {
    console.error("[reconcile] falha ao listar cobrancas orfas:", error);
    return result;
  }

  for (const row of (orphans || []) as Payment[]) {
    result.checked += 1;

    const reference = row.provider_external_id || row.id;
    let providerStatus: Parameters<typeof decideReconcileAction>[0]["providerStatus"];
    let providerPix:
      | {
          txid: string;
          copyPaste: string;
          qrCodeBase64: string;
          expiresAt: string;
          feeAmountCents: number;
          netAmountCents: number;
        }
      | undefined;
    let providerPaymentId: string | undefined;

    try {
      if (row.environment === "test") {
        providerStatus = "not_found";
      } else {
        const provider = getProvider(row.environment, row.provider ?? undefined);
        const consulted = await provider.getPayment(reference);
        providerPix = consulted.pix;
        providerPaymentId = consulted.providerPaymentId;
        providerStatus =
          consulted.status === "succeeded"
            ? "paid"
            : consulted.status === "expired"
              ? "expired"
              : consulted.status === "failed" || consulted.status === "canceled"
                ? "failed"
                : "pending";
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      providerStatus = /nao encontrada|not found|404/i.test(message) ? "not_found" : "unreachable";
    }

    const ageSeconds = Math.floor((Date.now() - new Date(row.created_at).getTime()) / 1000);
    const decision = decideReconcileAction({
      ageSeconds,
      graceSeconds: ORPHAN_GRACE_SECONDS,
      providerStatus,
    });

    if (decision.action === "wait") continue;

    if (decision.action === "fail") {
      await markPixPaymentFailedOrExpired(row, providerStatus === "expired" ? "expired" : "failed");
      result.failed += 1;
      console.warn("[reconcile] cobranca encerrada:", { paymentId: row.id, reason: decision.reason });
      continue;
    }

    if (providerPix || providerPaymentId) {
      const { data: attached } = await supabaseAdmin
        .from("payments")
        .update({
          provider_payment_id: providerPaymentId ?? row.provider_payment_id ?? null,
          provider_txid: providerPix?.txid ?? null,
          pix_copy_paste: providerPix?.copyPaste ?? row.pix_copy_paste ?? null,
          pix_qr_code_base64: providerPix?.qrCodeBase64 ?? row.pix_qr_code_base64 ?? null,
          expires_at: providerPix?.expiresAt ?? row.expires_at ?? null,
          fee_amount: providerPix?.feeAmountCents ?? row.fee_amount,
          net_amount: providerPix?.netAmountCents ?? row.net_amount ?? null,
        })
        .eq("id", row.id)
        .select()
        .single();

      if (attached) Object.assign(row, attached as Payment);
      result.attached += 1;
    }

    if (decision.action === "confirm") {
      await markPixPaymentSucceeded(row);
      result.confirmed += 1;
    }
  }

  return result;
}

export async function reprocessUnmatchedProviderEvents(): Promise<{
  checked: number;
  confirmed: number;
}> {
  const { data: events, error } = await supabaseAdmin
    .from("provider_events")
    .select("id, event_type, payload, signature_valid, processed_at")
    .is("processed_at", null)
    .eq("signature_valid", true)
    .order("received_at", { ascending: true })
    .limit(100);

  const result = { checked: 0, confirmed: 0 };

  if (error) {
    console.error("[reconcile] falha ao listar provider_events pendentes:", error);
    return result;
  }

  for (const event of (events || []) as {
    id: string;
    event_type: string | null;
    payload: { event?: string; status?: string; txid?: string; external_id?: string } | null;
  }[]) {
    result.checked += 1;

    const payload = event.payload || {};
    const eventType = payload.event || event.event_type || "unknown";

    const payment = await getPaymentByProviderReference({
      txid: payload.txid,
      externalId: payload.external_id,
    });

    const decision = decideWebhookAction({
      eventType,
      status: payload.status,
      payment: payment ? { id: payment.id, status: payment.status } : null,
      alreadyProcessed: false,
    });

    if (decision.action === "retry_later") continue;

    if (decision.action === "confirm") {
      await markPixPaymentSucceeded(payment as Payment);
      result.confirmed += 1;
    }

    await supabaseAdmin
      .from("provider_events")
      .update({
        processed_at: new Date().toISOString(),
        processing_error: decision.action === "confirm" ? null : `reconciliado: ${decision.action}`,
        payment_id: payment?.id ?? null,
        organization_id: payment?.organization_id ?? null,
        environment: payment?.environment ?? null,
      })
      .eq("id", event.id);
  }

  return result;
}
