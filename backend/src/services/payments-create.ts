import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../config/supabase.js";
import { createChargeWithFailover } from "../providers/index.js";
import { AppError } from "../middleware/error.js";
import { dispatchWebhook } from "./webhooks.js";
import { env } from "../config/env.js";
import { calculateFee } from "./fees.js";
import { buildAttemptLog } from "./attempt-log.js";
import {
  buildProviderExternalId,
  getPaymentByIdempotencyKey,
} from "./payments-queries.js";
import type {
  CreatePaymentInput,
  Payment,
  Environment,
} from "../types/index.js";
import type { AcquirerId, FeeRuleSnapshot } from "../providers/types.js";

/**
 * Cria cobranca com roteamento multi-adquirente e failover.
 * Persiste provider_attempt_log; se a coluna falhar no update,
 * faz retry sem o campo (success/fail/ambiguous). Nunca reenvia cobranca ao adquirente.
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
      const ambiguousPatch = {
        provider: attemptResult.providerId,
        provider_response: {
          ambiguous: true,
          error: attemptResult.errorMessage,
          latencyMs: attemptResult.latencyMs,
        },
        provider_attempt_log: buildAttemptLog(attemptResult),
      };
      let { data: pendingRow, error: ambErr } = await supabaseAdmin
        .from("payments")
        .update(ambiguousPatch)
        .eq("id", paymentId)
        .select()
        .single();
      // Soft-retry without log — never creates a second charge at the acquirer.
      if (ambErr || !pendingRow) {
        console.warn("[payments] ambiguous update with attempt_log failed; retrying without it:", ambErr?.message);
        const { provider_attempt_log: _drop, ...withoutLog } = ambiguousPatch;
        const retry = await supabaseAdmin
          .from("payments")
          .update(withoutLog)
          .eq("id", paymentId)
          .select()
          .single();
        pendingRow = retry.data;
      }
      if (pendingRow) {
        dispatchWebhook(organizationId, environment, "payment.pending", pendingRow).catch(console.error);
        return pendingRow as Payment;
      }
      // DB still failed: local row may remain "pending" with provider "pending".
      // Do NOT retry createCharge — outcome is uncertain; reconciliation must handle it.
      console.error("[payments] ambiguous result could not be persisted:", { paymentId });
      throw new AppError(
        502,
        "provider_error",
        "Cobranca registrada localmente; confirmacao pendente de reconciliacao."
      );
    }

    const nowIso = new Date().toISOString();
    const failedPatch = {
      status: "failed" as const,
      provider: attemptResult.providerId,
      failed_at: nowIso,
      provider_response: {
        error: attemptResult.errorMessage,
        errorCode: attemptResult.errorCode,
        latencyMs: attemptResult.latencyMs,
      },
      provider_attempt_log: buildAttemptLog(attemptResult),
    };
    let { data: failedRow, error: failErr } = await supabaseAdmin
      .from("payments")
      .update(failedPatch)
      .eq("id", paymentId)
      .select()
      .single();
    if (failErr || !failedRow) {
      console.warn("[payments] failed update with attempt_log failed; retrying without it:", failErr?.message);
      const { provider_attempt_log: _drop, ...withoutLog } = failedPatch;
      const retry = await supabaseAdmin
        .from("payments")
        .update(withoutLog)
        .eq("id", paymentId)
        .select()
        .single();
      failedRow = retry.data;
    }

    if (failedRow) {
      dispatchWebhook(organizationId, environment, "payment.failed", failedRow).catch(console.error);
      return failedRow as Payment;
    }

    // No second charge: acquirer already returned definitive failure.
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
  const status =
    paymentType === "pix" && providerStatus === "succeeded"
      ? "processing"
      : providerStatus;

  let payment: Record<string, unknown> | null = null;
  const { data: paymentData, error: updateError } = await supabaseAdmin
    .from("payments")
    .update({
      status,
      provider: usedProviderId,
      provider_payment_id: attemptResult.providerPaymentId || null,
      provider_response: attemptResult.rawResponse ?? null,
      provider_attempt_log: buildAttemptLog(attemptResult),
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

  payment = paymentData as Record<string, unknown> | null;
  if (updateError || !payment) {
    console.warn("[payments] update with attempt_log failed; retrying without it:", updateError?.message);
    const retry = await supabaseAdmin
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
    if (retry.error || !retry.data) {
      console.error("Create payment error (update pos-provider):", {
        paymentId,
        providerExternalId,
        error: retry.error || updateError,
      });
      throw new AppError(
        500,
        "api_error",
        "A cobranca foi criada, mas houve falha ao registra-la. Consulte em instantes antes de tentar de novo."
      );
    }
    payment = retry.data as Record<string, unknown>;
  }

  const paymentRow = payment as unknown as Payment;
  let finalPayment = paymentRow;

  if (providerStatus === "succeeded") {
    if (paymentRow.payment_type === "pix") {
      const { data: confirmed, error: ledgerError } = await supabaseAdmin.rpc(
        "fluxpay_confirm_pix_payment",
        {
          p_payment_id: paymentRow.id,
          p_organization_id: organizationId,
          p_environment: environment,
        }
      );

      const confirmedPayment = Array.isArray(confirmed) ? confirmed[0] : confirmed;
      if (ledgerError || !confirmedPayment) {
        console.error("Atomic PIX ledger confirmation failed:", {
          paymentId: paymentRow.id,
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
          payment_id: paymentRow.id,
          description: input.description || "Payment",
          available_on: nowIso,
        });

      if (ledgerError && ledgerError.code !== "23505") {
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
