/**
 * Payments service public API.
 * Push notifications: PIX gerado (create) e venda paga (create succeeded + markPix succeeded).
 */
import { createPayment as createPaymentCore } from "./payments-create.js";
import {
  markPixPaymentSucceeded as markPixPaymentSucceededCore,
  buildProviderExternalId,
  getPaymentByIdempotencyKey,
  getPayment,
  listPayments,
  cancelPayment,
  createRefund,
  getPaymentByProviderReference,
  getPaymentByProviderTxid,
  simulateSandboxPayment,
  markPixPaymentFailedOrExpired,
  reconcileOrphanPixCharges,
  reprocessUnmatchedProviderEvents,
} from "./payments-queries.js";
import { notifyPixGeneratedSafe, notifySalePaidSafe } from "./push-hooks.js";
import type { CreatePaymentInput, Payment, Environment } from "../types/index.js";

export async function createPayment(
  organizationId: string,
  environment: Environment,
  input: CreatePaymentInput
): Promise<Payment> {
  const payment = await createPaymentCore(organizationId, environment, input);

  try {
    const isPix = payment.payment_type === "pix" || input.payment_method?.type === "pix";
    if (isPix && payment.status === "pending" && (payment as any).pix_copy_paste) {
      notifyPixGeneratedSafe({ organizationId, paymentId: payment.id });
    }
    if (payment.status === "succeeded") {
      notifySalePaidSafe({
        organizationId,
        paymentId: payment.id,
        amountCents: typeof payment.amount === "number" ? payment.amount : undefined,
      });
    }
  } catch (err) {
    console.error("[push] createPayment hook:", err);
  }

  return payment;
}

export async function markPixPaymentSucceeded(payment: Payment): Promise<void> {
  await markPixPaymentSucceededCore(payment);
  try {
    notifySalePaidSafe({
      organizationId: payment.organization_id,
      paymentId: payment.id,
      amountCents: typeof payment.amount === "number" ? payment.amount : undefined,
    });
  } catch (err) {
    console.error("[push] markPixPaymentSucceeded hook:", err);
  }
}

export {
  buildProviderExternalId,
  getPaymentByIdempotencyKey,
  getPayment,
  listPayments,
  cancelPayment,
  createRefund,
  getPaymentByProviderReference,
  getPaymentByProviderTxid,
  simulateSandboxPayment,
  markPixPaymentFailedOrExpired,
  reconcileOrphanPixCharges,
  reprocessUnmatchedProviderEvents,
};
