import { Router } from "express";
import { z } from "zod";
import { apiKeyAuth, requireSecretKey } from "../middleware/auth.js";
import { createWebhookEndpoint } from "../services/webhooks.js";
import { supabaseAdmin } from "../config/supabase.js";
import { env } from "../config/env.js";
import { verifyWebhookSignature } from "../utils/crypto.js";
import {
  getPaymentByProviderReference,
  markPixPaymentSucceeded,
} from "../services/payments.js";
import { decideWebhookAction } from "../services/provider-events.js";
import { syncKycFromProvider } from "../services/kyc.js";

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

router.get("/endpoints", apiKeyAuth, requireSecretKey, async (req, res, next) => {
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

    const payload = req.body as NexusPagWebhookPayload & {
      verification_id?: string;
      rejection_reason?: string;
      verification?: {
        id?: string;
        external_id?: string | null;
        status?: string;
        rejection_reason?: string | null;
        payer_name?: string | null;
      };
    };
    const eventType =
      payload.event || (req.headers["x-webhook-event"] as string | undefined) || "unknown";

    // NexusPag KYC pode variar o nome do evento entre kyc.verified/approved e
    // variantes equivalentes. Processamos somente eventos claramente KYC.
    const normalizedEvent = eventType.toLowerCase().replace(/_/g, ".");
    const providerStatus = String(payload.status || payload.verification?.status || "").toLowerCase();
    const isKycEvent =
      normalizedEvent.includes("kyc") &&
      (normalizedEvent.includes("verified") ||
        normalizedEvent.includes("approved") ||
        normalizedEvent.includes("rejected") ||
        normalizedEvent.includes("failed") ||
        providerStatus === "approved" ||
        providerStatus === "verified" ||
        providerStatus === "rejected");

    if (isKycEvent) {
      const verification = payload.verification;
      const providerVerificationId =
        payload.verification_id ||
        verification?.id ||
        (typeof (payload as any).id === "string" ? (payload as any).id : undefined);
      const externalId =
        verification?.external_id ||
        payload.external_id ||
        (typeof (payload as any).external_id === "string" ? (payload as any).external_id : undefined);

      if (!providerVerificationId && !externalId) {
        res.status(200).json({ received: true, warning: "KYC sem id de verificacao." });
        return;
      }

      const providerEventId = `kyc:${eventType}:${providerVerificationId || externalId}`;
      const { data: eventRow, error: eventError } = await supabaseAdmin
        .from("provider_events")
        .insert({
          provider: "nexuspag",
          provider_event_id: providerEventId,
          event_type: eventType,
          payload: payload as unknown as Record<string, unknown>,
          signature_valid: true,
        })
        .select("id, processed_at")
        .maybeSingle();

      if (eventError?.code === "23505") {
        const { data: previous } = await supabaseAdmin
          .from("provider_events")
          .select("id, processed_at")
          .eq("provider", "nexuspag")
          .eq("provider_event_id", providerEventId)
          .maybeSingle();
        if (previous?.processed_at) {
          res.status(200).json({ received: true, duplicate: true });
          return;
        }
      } else if (eventError) {
        throw eventError;
      }

      const rejected = normalizedEvent.includes("rejected") || normalizedEvent.includes("failed") || providerStatus === "rejected";
      const result = await syncKycFromProvider({
        providerVerificationId: providerVerificationId || externalId!,
        eventStatus: rejected ? "rejected" : "approved",
        rejectionReason:
          verification?.rejection_reason ||
          payload.rejection_reason ||
          (typeof (payload as any).reason === "string" ? (payload as any).reason : null),
        payerName: verification?.payer_name || payload.payer_name || null,
        providerResponse: payload,
      });

      const update = {
        processed_at: new Date().toISOString(),
        processing_error: result.matched ? null : "Verificacao KYC ainda nao encontrada no FluxPay.",
        organization_id: result.organizationId ?? null,
      };
      await supabaseAdmin
        .from("provider_events")
        .update(update)
        .eq("provider", "nexuspag")
        .eq("provider_event_id", providerEventId);

      res.status(200).json({
        received: true,
        matched: result.matched,
        pending_reconciliation: !result.matched,
      });
      return;
    }


    const eventType =
      payload.event || (req.headers["x-webhook-event"] as string | undefined) || "unknown";
    const txid = payload.txid;
    const externalId = payload.external_id || null;

    if (!txid && !externalId) {
      // 200 de proposito: sem txid nem external_id nao ha como casar o evento
      // com cobranca nenhuma, e retentar nao mudaria isso.
      res.status(200).json({ received: true, warning: "sem txid nem external_id no payload" });
      return;
    }

    // Id de deduplicacao: continua sendo "<evento>:<referencia>", com o txid
    // como referencia preferencial. A UNIQUE(provider, provider_event_id) de
    // provider_events segue sendo o que impede creditar o ledger duas vezes
    // quando a NexusPag reenvia (ate 8 tentativas em ~7 dias).
    const providerEventId = `${eventType}:${txid || externalId}`;

    // Busca por txid E por external_id. O external_id e gravado ANTES da
    // chamada ao adquirente (ver services/payments.ts), entao ele casa mesmo
    // no intervalo em que o txid ainda nao foi persistido.
    const payment = await getPaymentByProviderReference({ txid, externalId });

    // O insert acontece ANTES do processamento, de proposito: e ele que
    // arbitra duplicidade.
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

    let alreadyProcessed = false;

    if (dedupeError) {
      if (dedupeError.code !== "23505") {
        // Falha de escrita nossa: 5xx para a NexusPag reenviar, senao o evento
        // seria processado sem rastro de auditoria.
        console.error("Falha ao gravar provider_events:", dedupeError);
        res.status(500).json({ error: { type: "api_error", message: "Falha ao registrar evento." } });
        return;
      }

      // unique_violation: o evento ja chegou antes. Ainda assim precisamos
      // saber se ele foi APLICADO — a primeira entrega pode ter ficado
      // pendente por nao achar a cobranca. Se ficou, esta entrega e uma
      // segunda chance de confirmar, em vez de um "duplicado" silencioso.
      const { data: previous } = await supabaseAdmin
        .from("provider_events")
        .select("id, processed_at")
        .eq("provider", "nexuspag")
        .eq("provider_event_id", providerEventId)
        .maybeSingle();

      alreadyProcessed = Boolean(previous?.processed_at);

      if (alreadyProcessed) {
        res.status(200).json({ received: true, duplicate: true });
        return;
      }
    }

    const eventId = eventRow?.id ?? null;

    const markProcessed = async (error?: string) => {
      if (!eventId) {
        // Reentrega de um evento que continua pendente: atualiza pela chave
        // logica, ja que nao temos o id devolvido pelo insert.
        await supabaseAdmin
          .from("provider_events")
          .update({
            processed_at: new Date().toISOString(),
            processing_error: error ?? null,
            payment_id: payment?.id ?? null,
            organization_id: payment?.organization_id ?? null,
            environment: payment?.environment ?? null,
          })
          .eq("provider", "nexuspag")
          .eq("provider_event_id", providerEventId);
        return;
      }

      await supabaseAdmin
        .from("provider_events")
        .update({ processed_at: new Date().toISOString(), processing_error: error ?? null })
        .eq("id", eventId);
    };

    const decision = decideWebhookAction({
      eventType,
      status: payload.status,
      payment: payment ? { id: payment.id, status: payment.status } : null,
      alreadyProcessed,
    });

    switch (decision.action) {
      case "duplicate":
        res.status(200).json({ received: true, duplicate: true });
        return;

      case "confirm":
        await markPixPaymentSucceeded(payment!);
        await markProcessed();
        res.status(200).json({ received: true });
        return;

      case "retry_later":
        // NAO marca como processado: a linha fica pendente e a reconciliacao
        // automatica (reprocessUnmatchedProviderEvents, chamada pela funcao
        // agendada a cada 10 min) tenta de novo sozinha. Antes daqui esse caso
        // era marcado como processado e so saia do limbo com alguem clicando
        // em "reprocessar" no ADM.
        await supabaseAdmin
          .from("provider_events")
          .update({ processing_error: decision.reason })
          .eq("provider", "nexuspag")
          .eq("provider_event_id", providerEventId);

        // 200: a entrega chegou e foi registrada. Retentar do lado do
        // adquirente nao ajudaria — quem resolve daqui em diante somos nos.
        res.status(200).json({ received: true, pending_reconciliation: true });
        return;

      case "ignore":
        await markProcessed(decision.reason);
        res.status(200).json({ received: true, ignored: true });
        return;
    }
  } catch (err) {
    next(err);
  }
});

export default router;
