/**
 * Pontos de integracao seguros para disparar push a partir do fluxo de pagamentos.
 * Falhas de push nunca rebentam a cobranca.
 */
import { notifyOrganizationMembers } from "./push.js";

export function notifyPixGeneratedSafe(params: {
  organizationId: string;
  paymentId: string;
}): void {
  const eventKey = `pix_generated:${params.paymentId}`;
  notifyOrganizationMembers({
    organizationId: params.organizationId,
    kind: "pix_generated",
    eventKey,
  }).catch((err) => console.error("[push] pix_generated:", err));
}

export function notifySalePaidSafe(params: {
  organizationId: string;
  paymentId: string;
  amountCents?: number;
}): void {
  const eventKey = `sale_paid:${params.paymentId}`;
  let amountLabel: string | undefined;
  if (typeof params.amountCents === "number") {
    amountLabel = (params.amountCents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }
  notifyOrganizationMembers({
    organizationId: params.organizationId,
    kind: "sale_paid",
    eventKey,
    amountLabel,
  }).catch((err) => console.error("[push] sale_paid:", err));
}
