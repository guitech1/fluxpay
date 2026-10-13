import { Router } from "express";
import { apiKeyAuth, requireSecretKey } from "../middleware/auth.js";
import { createWebhookEndpoint } from "../services/webhooks.js";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";

/**
 * TEMPORARY STUB — full implementation must be restored from main (blob 5a722326)
 * + notifyAfterPixConfirmed after markPixPaymentSucceeded.
 * Draft PR only; do not deploy to production with this stub.
 */
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

router.post("/nexuspag", (_req, res) => {
  res.status(503).json({
    error: {
      type: "api_error",
      message: "Webhook handler temporarily unavailable — restore backend/src/routes/webhooks.ts from main.",
    },
  });
});

router.post("/provider", (_req, res) => {
  res.status(503).json({
    error: {
      type: "api_error",
      message: "Webhook handler temporarily unavailable — restore backend/src/routes/webhooks.ts from main.",
    },
  });
});

export default router;
