/**
 * Payments service public API.
 * Push: PIX gerado no create; venda paga em markPixPaymentSucceeded (notify automatico).
 *
 * Guardas de producao: ambiente test e provider sandbox nao creditam saldo.
 */
import { createPayment as createPaymentCore } from "./payments-create.js";
import { notifyPixGeneratedAwaited, notifySalePaidAwaited } from "./push-hooks.js";
import { AppError } from "../middleware/error.js";
import {
  assertCanCreditLedger,
  assertLiveEnvironmentForMoney,
} from "./test-env-guard.js";
import type { CreatePaymentInput, Payment, Environment } from "../types/index.js";

import {
  buildProviderExternalId,
  getPaymentByIdempotencyKey,
  getPayment,
  listPayments,
  cancelPayment,
  createRefund,
  getPaymentByProviderReference,
  getPaymentByProviderTxid,
  markPixPaymentSucceeded as markPixPaymentSucceededCore,
  markPixPaymentFailedOrExpired,
  reconcileOrphanPixCharges,
  reprocessUnmatchedProviderEvents,
  simulateSandboxPayment as simulateSandboxPaymentCore,
} from "./payments-queries.js";

export async function createPayment(
  organizationId: string,
  environment: Environment,
  input: CreatePaymentInput
): Promise<Payment> {
  assertLiveEnvironmentForMoney(environment, "createPayment");

  const payment = await createPaymentCore(organizationId, environment, input);

  try {
    const isPix = payment.payment_type === "pix" || input.payment_method?.type === "pix";
    if (isPix && payment.status === "pending" && (payment as any).pix_copy_paste) {
      await notifyPixGeneratedAwaited({ organizationId, paymentId: payment.id });
    }
    if (payment.status === "succeeded") {
      await notifySalePaidAwaited({
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

/** Confirma PIX no ledger — recusa sandbox/test em producao. */
export async function markPixPaymentSucceeded(payment: Payment): Promise<Payment> {
  assertCanCreditLedger({
    environment: payment.environment,
    provider: payment.provider,
    context: "markPixPaymentSucceeded",
  });
  return markPixPaymentSucceededCore(payment);
}

/** Simulacao de pagamento de teste — desligada em producao. */
export async function simulateSandboxPayment(
  organizationId: string,
  paymentId: string
): Promise<Payment> {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.FLUXPAY_ALLOW_TEST_ENV !== "true"
  ) {
    throw new AppError(404, "not_found", "Recurso nao encontrado.");
  }
  return simulateSandboxPaymentCore(organizationId, paymentId);
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
  markPixPaymentFailedOrExpired,
  reconcileOrphanPixCharges,
  reprocessUnmatchedProviderEvents,
};
