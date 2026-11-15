import { v4 as uuidv4 } from "uuid";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";
import { signWebhookPayload } from "./webhooks.js";

/**
 * Envia um evento sintético ao endpoint (sem criar cobrança real).
 * Usa o mesmo formato e assinatura FluxPay-Signature das entregas reais.
 */
export async function testWebhookDelivery(params: {
  organizationId: string;
  environment: string;
  endpointId: string;
  eventType: string;
}): Promise<{ delivered: boolean; http_status?: number; message: string }> {
  const { data: endpoint } = await supabaseAdmin
    .from("webhook_endpoints")
    .select("id, url, secret, enabled, organization_id, environment")
    .eq("id", params.endpointId)
    .eq("organization_id", params.organizationId)
    .eq("environment", params.environment)
    .maybeSingle();

  if (!endpoint) throw new AppError(404, "not_found", "Endpoint não encontrado neste ambiente.");
  if (!endpoint.enabled) {
    throw new AppError(400, "invalid_request", "Ative o endpoint antes de testar.");
  }

  const eventId = `evt_test_${uuidv4().replace(/-/g, "").slice(0, 16)}`;
  const created = new Date().toISOString();
  const body = {
    id: eventId,
    type: params.eventType,
    created,
    data: {
      id: `pay_test_${uuidv4().slice(0, 8)}`,
      amount: 4990,
      currency: "BRL",
      status: params.eventType.includes("succeeded")
        ? "succeeded"
        : params.eventType.includes("failed")
          ? "failed"
          : "pending",
      payment_type: "pix",
      description: "Evento de teste FluxPay",
      payer_name: "Cliente Teste",
      test: true,
    },
  };

  const payload = JSON.stringify(body);
  const signature = signWebhookPayload(payload, endpoint.secret as string);

  const deliveryId = uuidv4();
  await supabaseAdmin.from("webhook_deliveries").insert({
    id: deliveryId,
    webhook_endpoint_id: endpoint.id,
    status: "pending",
    attempt_count: 1,
    request_headers: {
      "Content-Type": "application/json",
      "FluxPay-Signature": signature,
      "User-Agent": "FluxPay-Webhook/1.0",
      "X-FluxPay-Test": "1",
    },
    request_body: body,
  });

  try {
    const res = await fetch(endpoint.url as string, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "FluxPay-Signature": signature,
        "User-Agent": "FluxPay-Webhook/1.0",
        "X-FluxPay-Test": "1",
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
      })
      .eq("id", deliveryId);

    return {
      delivered: ok,
      http_status: res.status,
      message: ok
        ? `Entrega ok (HTTP ${res.status}). Confira no seu servidor.`
        : `Seu endpoint respondeu HTTP ${res.status}. Ajuste para retornar 2xx.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Falha de rede";
    await supabaseAdmin
      .from("webhook_deliveries")
      .update({ status: "failed", response_status: null })
      .eq("id", deliveryId);
    return {
      delivered: false,
      message: `Não foi possível alcançar a URL (${msg}). Verifique HTTPS e firewall.`,
    };
  }
}
