import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../config/supabase.js";
import { env } from "../config/env.js";
import { AppError } from "../middleware/error.js";
import { createPayment, markPixPaymentSucceeded } from "./payments.js";
import type { CreateCheckoutSessionInput, Environment, Payment } from "../types/index.js";

export async function createCheckoutSession(
  organizationId: string,
  environment: Environment,
  input: CreateCheckoutSessionInput
) {
  if (!input.amount || input.amount <= 0) {
    throw new AppError(400, "validation_error", "Amount must be positive.");
  }
  if (!input.success_url || !input.cancel_url) {
    throw new AppError(400, "validation_error", "success_url and cancel_url are required.");
  }

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

  const { data, error } = await supabaseAdmin
    .from("checkout_sessions")
    .insert({
      id: uuidv4(),
      organization_id: organizationId,
      environment,
      customer_id: input.customer_id || null,
      amount: input.amount,
      currency: (input.currency || "BRL").toUpperCase(),
      status: "open",
      success_url: input.success_url,
      cancel_url: input.cancel_url,
      line_items: input.line_items || [],
      metadata: input.metadata || {},
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new AppError(500, "api_error", "Failed to create checkout session.");
  }

  // Public URL for the hosted checkout page
  const checkoutUrl = `${env.FRONTEND_URL}/checkout/${data.id}`;

  return {
    ...data,
    url: checkoutUrl,
  };
}

export async function getCheckoutSession(sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from("checkout_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !data) {
    throw new AppError(404, "not_found", "Checkout session not found.");
  }

  if (data.status === "open" && data.expires_at && new Date(data.expires_at) < new Date()) {
    await supabaseAdmin
      .from("checkout_sessions")
      .update({ status: "expired" })
      .eq("id", sessionId);
    data.status = "expired";
  }

  return data;
}

/**
 * Gera (ou reaproveita) a cobranca PIX de uma sessao de checkout.
 *
 * Chamada pela pagina publica de checkout, que nao tem API key nenhuma —
 * quem paga e o cliente final do lojista. Por isso a rota e publica e este
 * servico nunca recebe organization_id de fora: ele sempre usa a organizacao
 * gravada na propria sessao.
 *
 * Idempotente na pratica: se a sessao ja tem um PIX pendente e nao vencido,
 * devolve o mesmo QR Code em vez de criar outra cobranca no adquirente.
 */
export async function payCheckoutSessionWithPix(
  sessionId: string
): Promise<{ session: Record<string, unknown>; payment: Payment }> {
  const session = await getCheckoutSession(sessionId);

  if (session.status !== "open") {
    throw new AppError(409, "invalid_request", "Esta sessao de checkout nao esta mais aberta.");
  }

  if (session.payment_id) {
    const { data: existing } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("id", session.payment_id)
      .maybeSingle();

    const stillValid =
      existing &&
      existing.status === "pending" &&
      (!existing.expires_at || new Date(existing.expires_at) > new Date());

    if (existing && (stillValid || existing.status === "succeeded")) {
      return { session, payment: existing as Payment };
    }
  }

  const payment = await createPayment(session.organization_id, session.environment as Environment, {
    amount: session.amount,
    currency: session.currency,
    customer_id: session.customer_id || undefined,
    description: `Checkout ${session.id}`,
    payment_method: { type: "pix" },
    metadata: { checkout_session_id: session.id },
  });

  await supabaseAdmin
    .from("checkout_sessions")
    .update({ payment_id: payment.id })
    .eq("id", session.id);

  return { session, payment };
}

/**
 * Confirma um PIX SIMULADO (ambiente de teste, provider sandbox).
 *
 * Em producao quem confirma e o webhook da NexusPag. Em teste nao existe
 * adquirente para mandar webhook nenhum, entao sem isto o fluxo de checkout
 * nunca chegava ao fim fora de producao.
 *
 * As tres travas que tornam isso seguro:
 *   - a sessao precisa estar em environment "test";
 *   - o pagamento precisa ter sido criado pelo provider "sandbox";
 *   - qualquer outro caso devolve 404 (nem confirma que a rota existe).
 * Ou seja: nao ha caminho em que esta funcao confirme dinheiro real.
 */
export async function simulateCheckoutPayment(sessionId: string): Promise<{ status: string }> {
  const session = await getCheckoutSession(sessionId);

  if (session.environment !== "test" || !session.payment_id) {
    throw new AppError(404, "not_found", "Recurso nao encontrado.");
  }

  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("id", session.payment_id)
    .maybeSingle();

  if (!payment || payment.provider !== "sandbox" || payment.environment !== "test") {
    throw new AppError(404, "not_found", "Recurso nao encontrado.");
  }

  if (payment.status === "succeeded") {
    return { status: "succeeded" };
  }

  if (payment.status !== "pending") {
    throw new AppError(409, "invalid_request", "Esta cobranca nao esta mais pendente.");
  }

  await markPixPaymentSucceeded(payment as Payment);

  await supabaseAdmin
    .from("checkout_sessions")
    .update({ status: "complete" })
    .eq("id", session.id);

  return { status: "succeeded" };
}

/**
 * Status publico da sessao (usado pelo polling da pagina de checkout).
 * Quando o PIX ja foi confirmado pelo webhook da NexusPag, fecha a sessao.
 */
export async function getCheckoutSessionStatus(sessionId: string) {
  const session = await getCheckoutSession(sessionId);

  let paymentStatus: string | null = null;

  if (session.payment_id) {
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("status")
      .eq("id", session.payment_id)
      .maybeSingle();

    paymentStatus = payment?.status ?? null;

    if (paymentStatus === "succeeded" && session.status === "open") {
      await supabaseAdmin
        .from("checkout_sessions")
        .update({ status: "complete" })
        .eq("id", session.id);
      session.status = "complete";
    }
  }

  return {
    id: session.id,
    status: session.status as string,
    payment_status: paymentStatus,
    success_url: session.success_url as string | null,
  };
}
