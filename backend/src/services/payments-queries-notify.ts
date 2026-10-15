/**
 * Side-effect helper: called after successful ledger confirmation.
 * Idempotent via push_notification_log.event_key = sale_paid:{paymentId}.
 */
import { notifySalePaidSafe, notifySalePaidAwaited } from "./push-hooks.js";
import type { Payment } from "../types/index.js";

/** Fire-and-forget (legacy callers). Prefer Awaited in serverless paths. */
export function notifyAfterPixConfirmed(payment: Payment): void {
  try {
    notifySalePaidSafe({
      organizationId: payment.organization_id,
      paymentId: payment.id,
      amountCents: typeof payment.amount === "number" ? payment.amount : undefined,
    });
  } catch (err) {
    console.error("[push] notifyAfterPixConfirmed:", err);
  }
}

/** Awaited + timeout — use from webhooks / markPix so mobile delivery completes. */
export async function notifyAfterPixConfirmedAwaited(payment: Payment): Promise<void> {
  try {
    await notifySalePaidAwaited({
      organizationId: payment.organization_id,
      paymentId: payment.id,
      amountCents: typeof payment.amount === "number" ? payment.amount : undefined,
    });
  } catch (err) {
    console.error("[push] notifyAfterPixConfirmedAwaited:", err);
  }
}
