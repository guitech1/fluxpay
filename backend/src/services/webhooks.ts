import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";
import { signWebhookPayload, generateWebhookSecret } from "../utils/crypto.js";
import type { Environment } from "../types/index.js";

export async function dispatchWebhook(
  organizationId: string,
  environment: Environment,
  eventType: string,
  data: unknown
): Promise<void> {
  const eventId = uuidv4();
  const created_at = new Date().toISOString();

  const { error: eventError } = await supabaseAdmin.from("webhook_events").insert({
    id: eventId,
    organization_id: organizationId,
    environment,
    type: eventType,
    data,
    created_at,
  });

  if (eventError) {
    console.error("[webhooks] insert event:", eventError.message);
    return;
  }

  const event = { id: eventId, type: eventType, data, created_at };

  const { data: endpoints } = await supabaseAdmin
    .from("webhook_endpoints")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .eq("enabled", true);

  if (!endpoints?.length) return;

  for (const endpoint of endpoints) {
    const subscribed = endpoint.events as string[];
    if (subscribed.length > 0 && !subscribed.includes(eventType) && !subscribed.includes("*")) {
      continue;
    }
    await deliverWebhook(endpoint, event);
  }
}

async function deliverWebhook(
  endpoint: { id: string; url: string; secret: string },
  event: { id: string; type: string; data: unknown; created_at: string }
): Promise<void> {
  const payload = JSON.stringify({
    id: event.id,
    type: event.type,
    data: event.data,
    created: event.created_at,
  });

  const signature = signWebhookPayload(payload, endpoint.secret);
  const deliveryId = uuidv4();

  await supabaseAdmin.from("webhook_deliveries").insert({
    id: deliveryId,
    webhook_endpoint_id: endpoint.id,
    webhook_event_id: event.id,
    status: "pending",
    attempt_count: 1,
    request_headers: {
      "Content-Type": "application/json",
      "FluxPay-Signature": signature,
      "User-Agent": "FluxPay-Webhook/1.0",
    },
    request_body: JSON.parse(payload),
  });

  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "FluxPay-Signature": signature,
        "User-Agent": "FluxPay-Webhook/1.0",
      },
      body: payload,
      signal: AbortSignal.timeout(12000),
    });

    const ok = res.status >= 200 && res.status < 300;
    await supabaseAdmin
      .from("webhook_deliveries")
      .update({
        status: ok ? "success" : "failed",
        response_status: res.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", deliveryId);

    if (!ok) {
      await scheduleRetry(deliveryId, 1);
    }
  } catch (err) {
    await supabaseAdmin
      .from("webhook_deliveries")
      .update({
        status: "failed",
        response_body: String(err).slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", deliveryId);
    await scheduleRetry(deliveryId, 1);
  }
}

async function scheduleRetry(deliveryId: string, attemptCount: number): Promise<void> {
  // placeholder — retries processados por job separado
  void deliveryId;
  void attemptCount;
}

export async function processRetryingWebhooks(): Promise<{ processed: number }> {
  return { processed: 0 };
}

export async function retryDeliveryById(deliveryId: string): Promise<void> {
  void deliveryId;
}

export async function createWebhookEndpoint(
  organizationId: string,
  environment: Environment,
  url: string,
  events: string[],
  description?: string
) {
  const secret = generateWebhookSecret();

  const { data, error } = await supabaseAdmin
    .from("webhook_endpoints")
    .insert({
      organization_id: organizationId,
      environment,
      url,
      secret,
      events,
      description: description || null,
    })
    .select("id, url, events, description, enabled, created_at")
    .single();

  if (error) throw error;

  // Secret só na criação (e na rotação)
  return { ...data, secret };
}

/** Gera novo secret HMAC e invalida o anterior. Retorna o valor uma única vez. */
export async function rotateWebhookEndpointSecret(params: {
  organizationId: string;
  environment: Environment;
  endpointId: string;
}): Promise<{ id: string; secret: string }> {
  const secret = generateWebhookSecret();

  const { data, error } = await supabaseAdmin
    .from("webhook_endpoints")
    .update({ secret })
    .eq("id", params.endpointId)
    .eq("organization_id", params.organizationId)
    .eq("environment", params.environment)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[webhooks] rotate secret:", error.message);
    throw new AppError(500, "api_error", "Não foi possível gerar um novo secret.");
  }
  if (!data) {
    throw new AppError(404, "not_found", "Endpoint não encontrado neste ambiente.");
  }

  return { id: data.id as string, secret };
}
