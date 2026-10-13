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
import { notifyAfterPixConfirmed } from "../services/payments-queries-notify.js";
import {
  secretsFromEnv,
  verifyProviderWebhook,
  paymentProviderMatchesClaim,
} from "../services/webhook-provider-auth.js";
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
        "NEXUSPAG_WEBHOOK_SECRET ausente â€” webhook da NexusPag recusado sem processar."
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
        provider: "nexuspag<°s‹Du<°s‹Dv