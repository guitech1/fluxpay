import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../config/supabase.js";
import { signWebhookPayload, generateWebhookSecret } from "../utils/crypto.js";
import { env } from "../config/env.js";
import type { Environment } from "../types/index.js";

export async function dispatchWebhook(
  organizationId: string,
  environment: Environment,
  eventType: string,
  data: unknown
): Promise<void> {
  // Create event record
  const { data: event, error: eventError } = await supabaseAdmin
    .from("webhook_events")
    .insert({
      id: uuidv4(),
      organization_id: organizationId,
      environment,
      type: eventType,
      data,
    })
    .select()
    .single();

  if (eventError || !event) {
    console.error("Failed to create webhook event:", eventError);
    return;
  }

  // Find matching endpoints
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "FluxPay-Signature": signature,
        "User-Agent": "FluxPay-Webhook/1.0",
      },
      body: payload,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseBody = await response.text().catch(() => "");

    await supabaseAdmin
      .from("webhook_deliveries")
      .update({
        status: response.ok ? "success" : "failed",
        response_status: response.status,
        response_body: responseBody.slice(0, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", deliveryId);

    if (!response.ok) {
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

async function scheduleRetry(deliveryId: string, attempt: number): Promise<void> {
  if (attempt >= env.WEBHOOK_RETRY_MAX) return;

  // Exponential backoff: 30s, 2m, 10m, 1h, 6h
  const delays = [30, 120, 600, 3600, 21600];
  const delaySec = delays[Math.min(attempt - 1, delays.length - 1)];

  await supabaseAdmin
    .from("webhook_deliveries")
    .update({
      status: "retrying",
      attempt_count: attempt + 1,
      next_retry_at: new Date(Date.now() + delaySec * 1000).toISOString(),
    })
    .eq("id", deliveryId);
}

// ============================================================
// Reprocessamento de retries — chamado pela funcao agendada da Netlify
// (netlify/functions/scheduled-jobs.ts), nao pelo processo do servidor.
//
// Em ambiente serverless nao da para confiar em setTimeout sobrevivendo
// entre invocacoes: cada chamada da funcao e um processo novo. Por isso o
// retry vira "polling": scheduleRetry() so grava next_retry_at no banco, e
// esta funcao, chamada a cada poucos minutos, busca o que venceu e reenvia.
// ============================================================
export async function processRetryingWebhooks(): Promise<{ processed: number }> {
  const { data: deliveries, error } = await supabaseAdmin
    .from("webhook_deliveries")
    .select(
      "id, attempt_count, webhook_endpoints(id, url, secret), webhook_events(id, type, data, created_at)"
    )
    .eq("status", "retrying")
    .lte("next_retry_at", new Date().toISOString())
    .limit(50);

  if (error) {
    console.error("Falha ao buscar webhooks para retry:", error);
    return { processed: 0 };
  }
  if (!deliveries?.length) return { processed: 0 };

  for (const row of deliveries as any[]) {
    const endpoint = row.webhook_endpoints;
    const event = row.webhook_events;
    if (!endpoint || !event) continue;
    await retryDelivery(row.id, row.attempt_count as number, endpoint, event);
  }

  return { processed: deliveries.length };
}

/**
 * Reenvia UMA entrega especifica, carregando endpoint e evento pelo id.
 * Usado pelo ADM (reprocessamento manual); o fluxo automatico usa
 * processRetryingWebhooks, que ja tem os dados em maos.
 */
export async function retryDeliveryById(deliveryId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("webhook_deliveries")
    .select(
      "id, attempt_count, webhook_endpoints(id, url, secret), webhook_events(id, type, data, created_at)"
    )
    .eq("id", deliveryId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Entrega de webhook nao encontrada.");
  }

  const row = data as any;
  const endpoint = row.webhook_endpoints;
  const event = row.webhook_events;

  if (!endpoint || !event) {
    throw new Error("Entrega sem endpoint ou evento associado — nao ha o que reenviar.");
  }

  await retryDelivery(deliveryId, (row.attempt_count as number) ?? 0, endpoint, event);
}

async function retryDelivery(
  deliveryId: string,
  attemptCount: number,
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

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "FluxPay-Signature": signature,
        "User-Agent": "FluxPay-Webhook/1.0",
      },
      body: payload,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const responseBody = await response.text().catch(() => "");

    await supabaseAdmin
      .from("webhook_deliveries")
      .update({
        status: response.ok ? "success" : "retrying",
        response_status: response.status,
        response_body: responseBody.slice(0, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", deliveryId);

    if (!response.ok) {
      await scheduleRetry(deliveryId, attemptCount);
    }
  } catch (err) {
    await supabaseAdmin
      .from("webhook_deliveries")
      .update({ response_body: String(err).slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", deliveryId);
    await scheduleRetry(deliveryId, attemptCount);
  }
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

  if (error) {
    throw error;
  }

  // Return secret only on creation
  return { ...data, secret };
}
