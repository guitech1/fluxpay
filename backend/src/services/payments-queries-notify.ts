/**
 * Side-effect helper: called after successful ledger confirmation.
 * Idempotent via push_notification_log.event_key = sale_paid:{paymentId}.
 */
import { notifySalePaidSafe } from "./push-hooks.js";
import type { Payment } from "../types/index.js";

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
