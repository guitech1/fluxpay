/**
 * Fila local quando a adquirente falha de forma recuperável.
 * Mantém a cobrança em pending, retenta createCharge e evita o cliente pagar duas vezes.
 */
import { supabaseAdmin } from "../config/supabase.js";
import { createChargeWithFailover } from "../providers/index.js";
import { env } from "../config/env.js";
import { calculateFee } from "./fees.js";
import { buildAttemptLog } from "./attempt-log.js";
import { dispatchWebhook } from "./webhooks.js";
import type { Environment } from "../types/index.js";
import type { AcquirerId } from "../providers/types.js";

const MAX_RETRIES = 6;
const BASE_DELAY_MS = 8_000;

export type QueueState = "queued" | "confirming" | "exhausted";

export function isRetryableProviderFailure(result: {
  ambiguous?: boolean;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
}): boolean {
  if (result.ambiguous) return false; // caso especial: já tratado como confirming
  if (result.retryable === true) return true;
  const code = (result.errorCode || "").toLowerCase();
  const msg = (result.errorMessage || "").toLowerCase();
  if (code.includes("unavailable") || code.includes("timeout") || code.includes("503") || code.includes("502")) {
    return true;
  }
  if (
    msg.includes("indispon") ||
    msg.includes("timeout") ||
    msg.includes("temporar") ||
    msg.includes("network") ||
    msg.includes("econn") ||
    msg.includes("fetch failed")
  ) {
    return true;
  }
  return false;
}

export function clientMessageForPayment(payment: {
  status?: string;
  provider?: string | null;
  provider_response?: unknown;
  pix_copy_paste?: string | null;
}): string | null {
  const pr = (payment.provider_response || {}) as Record<string, unknown>;
  if (payment.status === "succeeded") return null;
  if (pr.ambiguous === true || pr.queue_state === "confirming") {
    return "Estamos confirmando com o banco. Não pague de novo — avise se já pagou.";
  }
  if (pr.queue_state === "queued" || payment.provider === "queued") {
    if (!payment.pix_copy_paste) {
      return "Estamos gerando seu PIX. Aguarde nesta tela — não tente pagar de outro lugar.";
    }
    return "Estamos confirmando o pagamento. Não pague de novo.";
  }
  if (pr.queue_state === "exhausted") {
    return "Não foi possível falar com o banco agora. Tente gerar um novo PIX em instantes.";
  }
  return null;
}

export function buildQueuedProviderResponse(params: {
  errorMessage?: string;
  errorCode?: string;
  attemptLog?: unknown;
  retryCount?: number;
}): Record<string, unknown> {
  const retryCount = params.retryCount ?? 0;
  const next = new Date(Date.now() + BASE_DELAY_MS * Math.max(1, retryCount + 1)).toISOString();
  return {
    queue_state: "queued" as QueueState,
    queued_at: new Date().toISOString(),
    retry_count: retryCount,
    next_retry_at: next,
    max_retries: MAX_RETRIES,
    error: params.errorMessage || "provider_unavailable",
    errorCode: params.errorCode || "provider_unavailable",
    attempt_log: params.attemptLog ?? null,
  };
}

export function buildConfirmingProviderResponse(params: {
  providerId?: string;
  errorMessage?: string;
  latencyMs?: number;
}): Record<string, unknown> {
  return {
    queue_state: "confirming" as QueueState,
    ambiguous: true,
    error: params.errorMessage,
    providerId: params.providerId,
    latencyMs: params.latencyMs,
    message:
      "Resposta ambígua da adquirente — cobrança pode ter sido criada. Não gere outro PIX igual.",
  };
}

/**
 * Processa até `limit` cobranças enfileiradas cujo next_retry_at já passou.
 */
export async function processProviderQueue(limit = 15): Promise<{ processed: number; recovered: number }> {
  const now = new Date().toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from("payments")
    .select(
      "id, organization_id, environment, amount, currency, description, provider_external_id, metadata, provider_response, expires_at, status"
    )
    .eq("status", "pending")
    .eq("provider", "queued")
    .is("pix_copy_paste", null)
    .order("created_at", { ascending: true })
    .limit(Math.min(limit, 50));

  if (error) {
    console.error("[provider-queue] list:", error.message);
    return { processed: 0, recovered: 0 };
  }

  let processed = 0;
  let recovered = 0;

  for (const row of rows || []) {
    const pr = (row.provider_response || {}) as Record<string, unknown>;
    const nextAt = typeof pr.next_retry_at === "string" ? pr.next_retry_at : null;
    if (nextAt && nextAt > now) continue;

    const retryCount = typeof pr.retry_count === "number" ? pr.retry_count : 0;
    if (retryCount >= MAX_RETRIES) {
      await supabaseAdmin
        .from("payments")
        .update({
          status: "failed",
          failed_at: now,
          provider_response: {
            ...pr,
            queue_state: "exhausted",
            exhausted_at: now,
          },
        })
        .eq("id", row.id);
      dispatchWebhook(
        row.organization_id as string,
        row.environment as Environment,
        "payment.failed",
        { ...row, status: "failed" }
      ).catch(console.error);
      processed += 1;
      continue;
    }

    const environment = row.environment as Environment;
    const organizationId = row.organization_id as string;
    const webhookUrl = `${env.API_BASE_URL}/v1/webhooks/provider`;
    const externalId = (row.provider_external_id as string) || row.id;

    let attemptResult;
    try {
      attemptResult = await createChargeWithFailover(
        {
          organizationId,
          amountCents: row.amount as number,
          currency: (row.currency as string) || "BRL",
          description: (row.description as string) || undefined,
          externalId,
          webhookUrl,
          expirationSeconds: 3600,
          metadata: (row.metadata as Record<string, unknown>) || {},
          attempt: retryCount + 1,
          attemptedProviders: [],
        },
        environment
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "retry_failed";
      await supabaseAdmin
        .from("payments")
        .update({
          provider_response: buildQueuedProviderResponse({
            errorMessage: msg,
            retryCount: retryCount + 1,
          }),
        })
        .eq("id", row.id);
      processed += 1;
      continue;
    }

    if (attemptResult.success && attemptResult.pix) {
      const usedProviderId = attemptResult.providerId as AcquirerId;
      let feeCalc;
      try {
        feeCalc = await calculateFee({
          amountCents: row.amount as number,
          organizationId,
          providerId: usedProviderId,
        });
      } catch {
        feeCalc = null;
      }

      const patch: Record<string, unknown> = {
        provider: usedProviderId,
        provider_payment_id: attemptResult.providerPaymentId || null,
        status: "pending",
        pix_copy_paste: attemptResult.pix.copyPaste,
        pix_qr_code_base64: attemptResult.pix.qrCodeBase64,
        expires_at: attemptResult.pix.expiresAt || row.expires_at,
        fee_amount: attemptResult.pix.feeAmountCents ?? feeCalc?.feeCents ?? 0,
        net_amount: attemptResult.pix.netAmountCents ?? feeCalc?.netCents ?? null,
        provider_response: {
          recovered_from_queue: true,
          queue_state: null,
          latencyMs: attemptResult.latencyMs,
        },
        provider_attempt_log: buildAttemptLog(attemptResult),
      };

      const { data: updated } = await supabaseAdmin
        .from("payments")
        .update(patch)
        .eq("id", row.id)
        .select()
        .single();

      if (updated) {
        dispatchWebhook(organizationId, environment, "payment.pending", updated).catch(console.error);
        recovered += 1;
      }
      processed += 1;
      continue;
    }

    if (attemptResult.ambiguous) {
      await supabaseAdmin
        .from("payments")
        .update({
          provider: attemptResult.providerId,
          provider_response: buildConfirmingProviderResponse({
            providerId: attemptResult.providerId,
            errorMessage: attemptResult.errorMessage,
            latencyMs: attemptResult.latencyMs,
          }),
          provider_attempt_log: buildAttemptLog(attemptResult),
        })
        .eq("id", row.id);
      processed += 1;
      continue;
    }

    // ainda falhou — re-enfileira
    await supabaseAdmin
      .from("payments")
      .update({
        provider_response: buildQueuedProviderResponse({
          errorMessage: attemptResult.errorMessage,
          errorCode: attemptResult.errorCode,
          attemptLog: buildAttemptLog(attemptResult),
          retryCount: retryCount + 1,
        }),
      })
      .eq("id", row.id);
    processed += 1;
  }

  return { processed, recovered };
}
