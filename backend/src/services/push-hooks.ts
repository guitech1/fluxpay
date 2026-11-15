/**
 * Pontos de integracao seguros para disparar push a partir do fluxo de pagamentos.
 * Falhas de push nunca rebentam a cobranca.
 */
import { notifyOrganizationMembers } from "./push.js";

const PUSH_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      console.warn(`[push] timeout ${ms}ms: ${label}`);
      resolve(null);
    }, ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((err) => {
        clearTimeout(t);
        console.error(`[push] ${label}:`, err);
        resolve(null);
      });
  });
}

export function notifyPixGeneratedSafe(params: {
  organizationId: string;
  paymentId: string;
}): void {
  void notifyPixGeneratedAwaited(params);
}

export async function notifyPixGeneratedAwaited(params: {
  organizationId: string;
  paymentId: string;
}): Promise<{ sent: number; skipped: boolean } | null> {
  const eventKey = `pix_generated:${params.paymentId}`;
  return withTimeout(
    notifyOrganizationMembers({
      organizationId: params.organizationId,
      kind: "pix_generated",
      eventKey,
    }),
    PUSH_TIMEOUT_MS,
    `pix_generated:${params.paymentId}`
  );
}

export function notifySalePaidSafe(params: {
  organizationId: string;
  paymentId: string;
  amountCents?: number;
  payerName?: string | null;
}): void {
  void notifySalePaidAwaited(params);
}

export async function notifySalePaidAwaited(params: {
  organizationId: string;
  paymentId: string;
  amountCents?: number;
  payerName?: string | null;
}): Promise<{ sent: number; skipped: boolean } | null> {
  const eventKey = `sale_paid:${params.paymentId}`;
  let amountLabel: string | undefined;
  if (typeof params.amountCents === "number") {
    const money = (params.amountCents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    const who = params.payerName?.trim();
    amountLabel = who ? `${money} de ${who}` : money;
  } else if (params.payerName?.trim()) {
    amountLabel = `de ${params.payerName.trim()}`;
  }
  return withTimeout(
    notifyOrganizationMembers({
      organizationId: params.organizationId,
      kind: "sale_paid",
      eventKey,
      amountLabel,
    }),
    PUSH_TIMEOUT_MS,
    `sale_paid:${params.paymentId}`
  );
}
