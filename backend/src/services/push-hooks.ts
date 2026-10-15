/**
 * Pontos de integracao seguros para disparar push a partir do fluxo de pagamentos.
 * Falhas de push nunca rebentam a cobranca.
 *
 * Em Netlify Functions o runtime congela logo apos a resposta HTTP.
 * Por isso o caminho de producao AGUARDA o envio (com timeout) em vez de
 * fire-and-forget — senao so o primeiro endpoint (muitas vezes o desktop)
 * recebe e o telemovel fica de fora.
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
}): void {
  void notifySalePaidAwaited(params);
}

export async function notifySalePaidAwaited(params: {
  organizationId: string;
  paymentId: string;
  amountCents?: number;
}): Promise<{ sent: number; skipped: boolean } | null> {
  const eventKey = `sale_paid:${params.paymentId}`;
  let amountLabel: string | undefined;
  if (typeof params.amountCents === "number") {
    amountLabel = (params.amountCents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
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
