import { supabaseAdmin } from "../config/supabase.js";
import { getProvider } from "../providers/index.js";
import { AppError } from "../middleware/error.js";
import { dispatchWebhook } from "./webhooks.js";
import { inScopeOrNull } from "../utils/scope.js";
import { decideReconcileAction, decideWebhookAction } from "./provider-events.js";
import { paymentProviderMatchesClaim } from "./webhook-provider-auth.js";
import type {
  Payment,
  Environment,
  CreateRefundInput,
} from "../types/index.js";

const ORPHAN_GRACE_SECONDS = 5 * 60;

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

  if (payment.payment_type === "pix" && payment.provider === "nexuspag") {
    throw new AppError(
      501,
      "provider_error",
      "Reembolso de PIX pela NexusPag não é suportado pela API atual."
    );
  }

  const refundAmount = input.amount ?? payment.amount;
  if (!Number.isSafeInteger(refundAmount) || refundAmount <= 0) {
    throw new AppError(400, "validation_error", "Valor de reembolso invalido.");
  }
  if (!payment.provider_payment_id) {
    throw new AppError(
      409,
      "invalid_request",
      "A cobranca nao possui referencia confirmada no adquirente; reembolso bloqueado para reconciliacao."
    );
  }

  const { data: reserved, error: reserveError } = await supabaseAdmin.rpc(
    "fluxpay_reserve_refund",
    {
      p_payment_id: paymentId,
      p_organization_id: organizationId,
      p_environment: payment.environment,
      p_amount: refundAmount,
      p_idempotency_key: input.idempotency_key,
      p_reason: input.reason || null,
      p_metadata: input.metadata || {},
    }
  );
  const envelope = Array.isArray(reserved) ? reserved[0] : reserved;
  const reservation = envelope?.refund;
  if (reserveError || !reservation) {
    const code = reserveError?.code;
    if (code === "23514") {
      throw new AppError(400, "validation_error", "O valor solicitado excede o saldo ainda disponivel para reembolso.");
    }
    if (code === "23505") {
      throw new AppError(409, "conflict", "A chave de idempotencia ja foi usada com parametros diferentes.");
    }
    if (code === "55000") {
      throw new AppError(409, "conflict", "Existe um reembolso pendente ou a cobranca exige reconciliacao. Nao repita a operacao.");
    }
    throw new AppError(503, "api_error", "Nao foi possivel reservar o reembolso no banco; nenhum pedido foi enviado ao adquirente.");
  }

  if (envelope.created === false) {
    if (reservation.status === "pending") {
      throw new AppError(409, "conflict", "Este reembolso já está pendente de confirmação/reconciliação. Não repita a operação.");
    }
    return reservation;
  }

  const provider = getProvider(payment.environment, payment.provider ?? undefined);
  let providerResult;
  try {
    providerResult = await provider.refundPayment({
      providerPaymentId: payment.provider_payment_id,
      amount: refundAmount,
    });
  } catch (err) {
    console.error("[refunds] provider result uncertain; reservation retained:", {
      refundId: reservation.id,
      paymentId,
      error: err instanceof Error ? err.message : err,
    });
    throw new AppError(
      502,
      "provider_error",
      "Resultado do adquirente incerto. O reembolso ficou reservado para reconciliacao; nao repita a solicitacao."
    );
  }

  const { data: finalized, error: finalizeError } = await supabaseAdmin.rpc(
    "fluxpay_finalize_refund",
    {
      p_refund_id: reservation.id,
      p_organization_id: organizationId,
      p_environment: payment.environment,
      p_status: providerResult.status,
      p_provider_refund_id: providerResult.providerRefundId || null,
      p_provider_response: providerResult.rawResponse ?? null,
    }
  );

  if (finalizeError || !finalized) {
    console.error("[refunds] finalize failed after provider success:", finalizeError);
    throw new AppError(
      500,
      "api_error",
      "Reembolso executado no adquirente, mas o registro local exige reconciliacao."
    );
  }

  const result = Array.isArray(finalized) ? finalized[0] : finalized;
  dispatchWebhook(organizationId, environment, "refund.created", result).catch(console.error);
  return result;
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
  }
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
  status: "failed" | "expired"
): Promise<void> {
  const nowIso = new Date().toISOString();
  await supabaseAdmin
    .from("payments")
    .update({
      status,
      failed_at: status === "failed" ? nowIso : null,
      expired_at: status === "expired" ? nowIso : null,
    })
    .eq("id", payment.id);
}

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
        const remote = await provider.getPayment(reference);
        providerPaymentId = remote.providerPaymentId;
        providerPix = remote.pix
          ? {
              txid: remote.pix.txid,
              copyPaste: remote.pix.copyPaste,
              qrCodeBase64: remote.pix.qrCodeBase64,
              expiresAt: remote.pix.expiresAt,
              feeAmountCents: remote.pix.feeAmountCents,
              netAmountCents: remote.pix.netAmountCents,
            }
          : undefined;
        if (remote.status === "succeeded") providerStatus = "paid";
        else if (remote.status === "expired") providerStatus = "expired";
        else if (remote.status === "failed" || remote.status === "canceled") providerStatus = "failed";
        else providerStatus = "pending";
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      if (msg.includes("404") || msg.includes("nao encontrado") || msg.includes("not found")) {
        providerStatus = "not_found";
      } else {
        providerStatus = "unreachable";
      }
    }

    const ageSeconds = Math.max(
      0,
      (Date.now() - new Date(row.created_at).getTime()) / 1000
    );

    const decision = decideReconcileAction({
      ageSeconds,
      graceSeconds: ORPHAN_GRACE_SECONDS,
      providerStatus,
    });

    if (decision.action === "wait") continue;

    if (decision.action === "confirm") {
      await markPixPaymentSucceeded(row);
      result.confirmed += 1;
      continue;
    }

    if (decision.action === "attach" && providerPix) {
      await supabaseAdmin
        .from("payments")
        .update({
          provider_payment_id: providerPaymentId || row.provider_payment_id,
          provider_txid: providerPix.txid,
          pix_copy_paste: providerPix.copyPaste,
          pix_qr_code_base64: providerPix.qrCodeBase64,
          expires_at: providerPix.expiresAt,
        })
        .eq("id", row.id);
      result.attached += 1;
      continue;
    }

    if (decision.action === "fail") {
      await markPixPaymentFailedOrExpired(row, providerStatus === "expired" ? "expired" : "failed");
      result.failed += 1;
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
    .select("id, provider, event_type, payload, signature_valid, processed_at")
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
    provider: string;
    event_type: string | null;
    payload: { event?: string; status?: string; txid?: string; transaction_id?: string; external_id?: string; id?: string } | null;
  }[]) {
    result.checked += 1;

    const payload = event.payload || {};
    const eventType = payload.event || event.event_type || "unknown";

    const payment = await getPaymentByProviderReference({
      txid: payload.txid || payload.transaction_id,
      externalId: payload.external_id || payload.id,
    });

    // Never apply an event authenticated with one acquirer's secret to another provider's payment.
    if (!payment) continue;

    if (!paymentProviderMatchesClaim(payment.provider, event.provider)) {
      await supabaseAdmin.from("provider_events").update({
        processed_at: new Date().toISOString(),
        processing_error: "payment_provider_mismatch",
        payment_id: payment.id,
        organization_id: payment.organization_id,
        environment: payment.environment,
      }).eq("id", event.id);
      continue;
    }

    const isPaid = eventType === "payment.confirmed" || eventType === "charge.paid" || payload.status === "paid";
    if (!isPaid) {
      await supabaseAdmin.from("provider_events").update({
        processed_at: new Date().toISOString(),
        processing_error: "reconciled: ignored_non_paid_event",
        payment_id: payment.id,
        organization_id: payment.organization_id,
        environment: payment.environment,
      }).eq("id", event.id);
      continue;
    }

    if (payment.payment_type && payment.payment_type !== "pix") {
      await supabaseAdmin.from("provider_events").update({
        processed_at: new Date().toISOString(),
        processing_error: "reconciled: ignored_non_pix_payment",
        payment_id: payment.id,
        organization_id: payment.organization_id,
        environment: payment.environment,
      }).eq("id", event.id);
      continue;
    }

    if (payment.status !== "succeeded") {
      await markPixPaymentSucceeded(payment);
      result.confirmed += 1;
    }

    await supabaseAdmin.from("provider_events").update({
      processed_at: new Date().toISOString(),
      processing_error: null,
      payment_id: payment.id,
      organization_id: payment.organization_id,
      environment: payment.environment,
    }).eq("id", event.id);
  }

  return result;
}
