import { Router } from "express";
import { z } from "zod";
import { apiKeyAuth, requireSecretKey } from "../middleware/auth.js";
import { createWebhookEndpoint } from "../services/webhooks.js";
import { supabaseAdmin } from "../config/supabase.js";
import { env } from "../config/env.js";
import { verifyWebhookSignature } from "../utils/crypto.js";
import {
  getPaymentByProviderTxid,
  markPixPaymentSucceeded,
} from "../services/payments.js";

const router = Router();

router.post("/endpoints", apiKeyAuth, requireSecretKey, async (req, res, next) => {
  try {
    const schema = z.object({
      url: z.string().url(),
      events: z.array(z.string()).min(1),
      description: z.string().max(255).optional(),
    });
    const body = schema.parse(req.body);

    const endpoint = await createWebhookEndpoint(
      req.auth!.organizationId,
      req.auth!.environment,
      body.url,
      body.events,
      body.description
    );

    res.status(201).json({ data: endpoint });
  } catch (err) {
    next(err);
  }
});

router.get("/endpoints", apiKeyAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("webhook_endpoints")
      .select("id, url, events, description, enabled, created_at")
      .eq("organization_id", req.auth!.organizationId)
      .eq("environment", req.auth!.environment);

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Webhook de ENTRADA da NexusPag — recebe a notificacao de pagamento PIX.
// Rota publica (o adquirente nao tem uma API key nossa); a autenticidade
// vem exclusivamente da assinatura HMAC, por isso a verificacao abaixo
// nao pode ser pulada em hipotese alguma.
//
// Formato conferido contra docs/nexuspag-api.md (secao "Webhooks"):
// - Headers: X-Webhook-Event: payment.confirmed (sempre) e
//   X-Webhook-Signature: t=<unix>,v1=<hmac_hex> (so quando ha webhook_secret
//   configurado no dashboard da NexusPag).
// - Assinatura = HMAC-SHA256 de "<unix>.<body_cru>" com o webhook_secret.
//   O formato e identico ao dos webhooks de SAIDA do FluxPay, entao usamos
//   verifyWebhookSignature de utils/crypto.js (comparacao em tempo constante
//   + janela de tolerancia de timestamp).
// - Payload PLANO (sem o wrapper "transaction" da criacao) e um unico evento
//   possivel: "payment.confirmed" com status "paid". Nao existe webhook de
//   expiracao/cancelamento — cobranca vencida e expirada pelo proprio FluxPay
//   via fluxpay_expire_stale_records (funcao agendada da Netlify).
// - Retry da NexusPag: ate 8 tentativas (~7 dias). 4xx encerra o retry,
//   5xx/timeout continuam. Por isso so devolvemos 4xx quando o problema e
//   realmente do lado deles (assinatura invalida) e 5xx quando o erro e nosso.
// ============================================================

interface NexusPagWebhookPayload {
  event?: string;
  transaction_id?: string;
  txid?: string;
  external_id?: string | null;
  status?: string;
  amount?: number;
  fee?: number;
  net_amount?: number;
  payer_name?: string;
  payer_document_masked?: string;
  paid_at?: string;
  shop_id?: string;
  shop_external_ref?: string;
}

router.post("/nexuspag", async (req, res, next) => {
  try {
    const rawBody: string | undefined = (req as any).rawBody;
    if (!rawBody) {
      // Sem o corpo bruto nao ha como validar a assinatura com seguranca.
      // 5xx para a NexusPag continuar tentando depois que corrigirmos.
      res.status(500).json({ error: { type: "api_error", message: "rawBody nao capturado." } });
      return;
    }

    // Fail closed: sem segredo configurado nao ha como provar a autenticidade
    // do evento, e um webhook falsificado credita dinheiro que nao entrou.
    // 5xx para a NexusPag reenviar depois que a variavel for configurada.
    if (!env.NEXUSPAG_WEBHOOK_SECRET) {
      console.error(
        "NEXUSPAG_WEBHOOK_SECRET ausente — webhook da NexusPag recusado sem processar."
      );
      res.status(503).json({
        error: { type: "api_error", message: "Webhook secret nao configurado." },
      });
      return;
    }

    const signatureHeader = req.headers["x-webhook-signature"] as string | undefined;
    const signatureValid =
      !!signatureHeader &&
      verifyWebhookSignature(rawBody, signatureHeader, env.NEXUSPAG_WEBHOOK_SECRET);

    if (!signatureValid) {
      res
        .status(401)
        .json({ error: { type: "authentication_error", message: "Assinatura invalida." } });
      return;
    }

    const payload = req.body as NexusPagWebhookPayload;
    const eventType =
      payload.event || (req.headers["x-webhook-event"] as string | undefined) || "unknown";
    const txid = payload.txid;

    if (!txid) {
      // 200 de proposito: sem txid nao ha o que fazer, e retentar nao ajuda.
      res.status(200).json({ received: true, warning: "sem txid no payload" });
      return;
    }

    // So existe um evento por transacao PIX, mas incluir o tipo no id mantem
    // a dedupe correta caso a NexusPag passe a enviar outros eventos.
    const providerEventId = `${eventType}:${txid}`;
    const payment = await getPaymentByProviderTxid(txid);

    // Deduplicacao: a UNIQUE(provider, provider_event_id) e quem garante que
    // um retry da NexusPag nao credite o ledger duas vezes. O insert acontece
    // ANTES do processamento justamente por isso.
    const { data: eventRow, error: dedupeError } = await supabaseAdmin
      .from("provider_events")
      .insert({
        provider: "nexuspag",
        provider_event_id: providerEventId,
        event_type: eventType,
        organization_id: payment?.organization_id ?? null,
        payment_id: payment?.id ?? null,
        environment: payment?.environment ?? null,
        payload: payload as unknown as Record<string, unknown>,
        signature_valid: true,
      })
      .select("id")
      .single();

    if (dedupeError) {
      if (dedupeError.code === "23505") {
        // unique_violation -> evento repetido, ja tratado antes.
        res.status(200).json({ received: true, duplicate: true });
        return;
      }
      // Falha de escrita nossa: 5xx para a NexusPag reenviar, senao o evento
      // seria processado sem rastro de auditoria.
      console.error("Falha ao gravar provider_events:", dedupeError);
      res.status(500).json({ error: { type: "api_error", message: "Falha ao registrar evento." } });
      return;
    }

    const markProcessed = async (error?: string) => {
      if (!eventRow?.id) return;
      await supabaseAdmin
        .from("provider_events")
        .update({ processed_at: new Date().toISOString(), processing_error: error ?? null })
        .eq("id", eventRow.id);
    };

    if (!payment) {
      await markProcessed("payment nao encontrado para este txid");
      res.status(200).json({ received: true, warning: "payment nao encontrado para este txid" });
      return;
    }

    // Unico caminho de sucesso previsto pela doc: payment.confirmed + status "paid".
    if (eventType === "payment.confirmed" && payload.status === "paid") {
      await markPixPaymentSucceeded(payment);
      await markProcessed();
      res.status(200).json({ received: true });
      return;
    }

    await markProcessed(`evento ignorado (event=${eventType}, status=${payload.status})`);
    res.status(200).json({ received: true, ignored: true });
  } catch (err) {
    next(err);
  }
});

export default router;
