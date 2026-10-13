import { supabaseAdmin } from "../config/supabase.js";
import { getProvider } from "../providers/index.js";
import { AppError } from "../middleware/error.js";
import { dispatchWebhook } from "./webhooks.js";
import { inScopeOrNull } from "../utils/scope.js";
import { decideReconcileAction, decideWebhookAction } from "./provider-events.js";
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
