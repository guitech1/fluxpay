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
import {
  applyKycApproved,
  applyKycRejected,
  findOrgIdByKycProviderIds,
} from "../services/kyc.js";

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
  verified_at?: string;
  rejection_reason?: string;
  shop_id?: string;
  shop_external_ref?: string;
  verification_id?: string;
  id?: string;
}

router.post("/nexuspag", async (req, res, next) => {
  try {
    const rawBody: string | undefined = (req as any).rawBody;
    if (!rawBody) {
      res.status(500).json({ error: { type: "api_error", message: "rawBody nao capturado." } });
      return;
    }

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

    // ---- KYC events (kyc.verified / kyc.rejected) ----
    if (eventType === "kyc.verified" || eventType === "kyc.rejected") {
      const providerVerificationId =
        payload.verification_id || payload.id || payload.transaction_id || null;
      const externalId = payload.external_id || null;
      const providerEventId = `${eventType}:${providerVerificationId || externalId || "unknown"}`;

      const orgId = await findOrgIdByKycProviderIds({
        providerVerificationId,
        externalId,
      });

      const { error: dedupeError } = await supabaseAdmin.from("provider_events").insert({
        provider: "nexuspag",
        provider_event_id: providerEventId,
        event_type: eventType,
        organization_id: orgId,
        payment_id: null,
        environment: null,
        payload: payload as unknown as Record<string, unknown>,
        signature_valid: true,
        processed_at: new Date().toISOString(),
      });

      if (dedupeError?.code === "23505") {
        res.status(200).json({ received: true, duplicate: true });
        return;
      }

      if (!orgId) {
        res.status(200).json({ received: true, warning: "kyc sem organizacao correspondente" });
        return;
      }

      if (eventType === "kyc.verified") {
        await applyKycApproved({
          organizationId: orgId,
          providerVerificationId,
          externalId,
          payerName: payload.payer_name,
          verifiedAt: payload.verified_at || payload.paid_at,
          via: "nexuspag",
        });
      } else {
        await applyKycRejected({
          organizationId: orgId,
          providerVerificationId,
          externalId,
          reason: payload.rejection_reason || "rejected",
        });
      }

      res.status(200).json({ received: true });
      return;
    }

    // ---- Payment events (existente) ----
    const txid = payload.txid;
    const externalId = payload.external_id || null;

    if (!txid && !externalId) {
      res.status(200).json({ received: true, warning: "sem txid nem external_id no payload" });
      return;
    }

    const providerEventId = `${eventType}:${txid || externalId}`;

    const payment = await getPaymentByProviderReference({ txid, externalId });

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
        console.error("Falha ao gravar provider_events:", dedupeError);
        res.status(500).json({ error: { type: "api_error", message: "Falha ao registrar evento." } });
        return;
      }

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
        await supabaseAdmin
          .from("provider_events")
          .update({ processing_error: decision.reason })
          .eq("provider", "nexuspag")
          .eq("provider_event_id", providerEventId);

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
