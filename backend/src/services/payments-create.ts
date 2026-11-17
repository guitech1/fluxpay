/**
 * Criação de cobranças (extraído de payments.ts).
 */
import { supabaseAdmin } from "../config/supabase.js";
import { env } from "../config/env.js";
import { AppError } from "../middleware/error.js";
import { createChargeWithFailover } from "../providers/index.js";
import { calculateFee } from "./fees.js";
import { buildAttemptLog } from "./attempt-log.js";
import { dispatchWebhook } from "./webhooks.js";
import {
  buildQueuedProviderResponse,
  buildConfirmingProviderResponse,
  clientMessageForPayment,
} from "./provider-queue.js";
import type { CreatePaymentInput, Payment, Environment } from "../types/index.js";
import type { AcquirerId, FeeRuleSnapshot } from "../providers/types.js";

function buildProviderExternalId(organizationId: string, paymentId: string): string {
  return `${organizationId}:${paymentId}`;
}

export async function createPayment(
  organizationId: string,
  environment: Environment,
  input: CreatePaymentInput
): Promise<Payment> {
  const paymentType =
    input.payment_method?.type === "card" ? "card" : "pix";
  const currency = (input.currency || "BRL").toUpperCase();

  if (currency !== "BRL") {
    throw new AppError(400, "invalid_request", "Apenas BRL é suportado.");
  }
  if (!input.amount || input.amount < 100) {
    throw new AppError(400, "invalid_request", "Valor mínimo é R$ 1,00.");
  }

  if (input.idempotency_key) {
    const { data: existing } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("environment", environment)
      .eq("idempotency_key", input.idempotency_key)
      .maybeSingle();
    if (existing) {
      return {
        ...(existing as Payment),
        client_message: clientMessageForPayment(existing as Payment),
      } as Payment;
    }
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("payments")
    .insert({
      organization_id: organizationId,
      environment,
      amount: input.amount,
      currency,
      description: input.description || null,
      status: "pending",
      payment_type: paymentType,
      provider: null,
      metadata: input.metadata || {},
      fee_amount: 0,
      net_amount: null,
      idempotency_key: input.idempotency_key || null,
    })
    .select()
    .single();

  if (insertError || !inserted) {
    if (insertError?.code === "23505" && input.idempotency_key) {
      const { data: existing } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("environment", environment)
        .eq("idempotency_key", input.idempotency_key)
        .maybeSingle();
      if (existing) {
        return {
          ...(existing as Payment),
          client_message: clientMessageForPayment(existing as Payment),
        } as Payment;
      }
    }
    throw insertError || new Error("Falha ao criar cobrança local");
  }

  const paymentId = inserted.id as string;
  const providerExternalId = buildProviderExternalId(organizationId, paymentId);

  await supabaseAdmin
    .from("payments")
    .update({ provider_external_id: providerExternalId })
    .eq("id", paymentId);

  const preferredProviderId = (
    environment === "test" ? "sandbox" : "nexuspag"
  ) as AcquirerId;

  let feeCalc = await calculateFee({
    amountCents: input.amount,
    organizationId,
    providerId: preferredProviderId,
  });

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
    const queuedPatch = {
      status: "pending" as const,
      provider: "queued",
      provider_response: buildQueuedProviderResponse({
        errorMessage: err instanceof Error ? err.message : "router_error",
        errorCode: "provider_unavailable",
        retryCount: 0,
      }),
    };
    const { data: queuedRow } = await supabaseAdmin
      .from("payments")
      .update(queuedPatch)
      .eq("id", paymentId)
      .select()
      .single();
    if (queuedRow) {
      dispatchWebhook(organizationId, environment, "payment.pending", queuedRow).catch(console.error);
      return {
        ...(queuedRow as Payment),
        client_message: clientMessageForPayment(queuedRow as Payment),
      } as Payment;
    }
    if (err instanceof AppError) throw err;
    throw new AppError(
      502,
      "provider_error",
      "Nao foi possivel gerar a cobranca no momento. Tente novamente em instantes."
    );
  }

  if (!attemptResult.success) {
    if (attemptResult.ambiguous) {
      const ambiguousPatch = {
        provider: attemptResult.providerId,
        provider_response: buildConfirmingProviderResponse({
          providerId: attemptResult.providerId,
          errorMessage: attemptResult.errorMessage,
          latencyMs: attemptResult.latencyMs,
        }),
        provider_attempt_log: buildAttemptLog(attemptResult),
      };
      const { data: pendingRow } = await supabaseAdmin
        .from("payments")
        .update(ambiguousPatch)
        .eq("id", paymentId)
        .select()
        .single();
      if (pendingRow) {
        dispatchWebhook(organizationId, environment, "payment.pending", pendingRow).catch(console.error);
        return {
          ...(pendingRow as Payment),
          client_message: clientMessageForPayment(pendingRow as Payment),
        } as Payment;
      }
    }

    if (attemptResult.retryable) {
      const queuedPatch = {
        status: "pending" as const,
        provider: "queued",
        provider_response: buildQueuedProviderResponse({
          errorMessage: attemptResult.errorMessage,
          errorCode: attemptResult.errorCode,
          attemptLog: buildAttemptLog(attemptResult),
          retryCount: 0,
        }),
        provider_attempt_log: buildAttemptLog(attemptResult),
      };
      const { data: queuedRow } = await supabaseAdmin
        .from("payments")
        .update(queuedPatch)
        .eq("id", paymentId)
        .select()
        .single();
      if (queuedRow) {
        dispatchWebhook(organizationId, environment, "payment.pending", queuedRow).catch(console.error);
        return {
          ...(queuedRow as Payment),
          client_message: clientMessageForPayment(queuedRow as Payment),
        } as Payment;
      }
    }

    const { data: failedRow } = await supabaseAdmin
      .from("payments")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        provider_response: {
          error: attemptResult.errorMessage,
          errorCode: attemptResult.errorCode,
        },
        provider_attempt_log: buildAttemptLog(attemptResult),
      })
      .eq("id", paymentId)
      .select()
      .single();

    if (failedRow) {
      dispatchWebhook(organizationId, environment, "payment.failed", failedRow).catch(console.error);
      return {
        ...(failedRow as Payment),
        client_message: clientMessageForPayment(failedRow as Payment),
      } as Payment;
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

  // Taxa SEMPRE pela regra FluxPay (calculateFee). fee/net da adquirente
  // é só custo dela e NÃO pode sobrescrever margem da plataforma.
  const feeAmount = feeCalc.feeAmountCents;
  const netAmount = feeCalc.netAmountCents;
  const feeSnapshot: FeeRuleSnapshot = feeCalc.snapshot;

  const nowIso = new Date().toISOString();
  const providerStatus = attemptResult.status || "pending";
  const status =
    paymentType === "pix" && providerStatus === "succeeded"
      ? "processing"
      : providerStatus;

  const payerName = attemptResult.pix?.payerName ?? null;
  const payerDocumentOut = attemptResult.pix?.payerDocument ?? null;

  const baseUpdate: Record<string, unknown> = {
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
    provider_attempt_log: buildAttemptLog(attemptResult),
  };

  if (payerName) baseUpdate.payer_name = payerName;
  if (payerDocumentOut) baseUpdate.payer_document = payerDocumentOut;

  const { data: paymentData, error: updateError } = await supabaseAdmin
    .from("payments")
    .update(baseUpdate)
    .eq("id", paymentId)
    .select()
    .single();

  if (updateError || !paymentData) {
    console.error("[payments] update após PIX:", updateError);
    throw new AppError(
      500,
      "api_error",
      "Cobrança criada na adquirente, mas falhou ao gravar localmente."
    );
  }

  const payment = paymentData as Payment;
  dispatchWebhook(organizationId, environment, "payment.pending", payment).catch(console.error);

  return {
    ...payment,
    client_message: clientMessageForPayment(payment),
  } as Payment;
}
