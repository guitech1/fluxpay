/**
 * Payments service public API.
 * Push: PIX gerado no create; venda paga em markPixPaymentSucceeded (notify automatico).
 */
import { createPayment as createPaymentCore } from "./payments-create.js";
import { notifyPixGeneratedAwaited, notifySalePaidAwaited } from "./push-hooks.js";
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
      // Await so Netlify Function does not freeze before mobile FCM delivery.
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

export {
  buildProviderExternalId,
  getPaymentByIdempotencyKey,
  getPayment,
  listPayments,
  cancelPayment,
  createRefund,
  getPaymentByProviderReference,
  getPaymentByProviderTxid,
  markPixPaymentSucceeded,
  simulateSandboxPayment,
  markPixPaymentFailedOrExpired,
  reconcileOrphanPixCharges,
  reprocessUnmatchedProviderEvents,
} from "./payments-queries.js";
