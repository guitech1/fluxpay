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
