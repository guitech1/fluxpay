import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import {
  requireAdminRole,
  logAdminAction,
} from "../middleware/admin-auth.js";
import {
  getMaintenanceSettings,
  invalidateMaintenanceCache,
} from "../middleware/maintenance.js";
import { retryDeliveryById } from "../services/webhooks.js";
import {
  getPaymentByProviderReference,
  markPixPaymentSucceeded,
} from "../services/payments.js";

const router = Router();
const reasonSchema = z.string().trim().min(10).max(500);

router.get("/webhooks", async (_req, res, next) => {
  try {
    const [deliveries, providerEvents] = await Promise.all([
      supabaseAdmin
        .from("webhook_deliveries")
        .select(
          "id, status, attempt_count, next_retry_at, response_status, created_at, webhook_endpoint_id, webhook_events(type, organization_id)"
        )
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("provider_events")
        .select(
          "id, provider, provider_event_id, event_type, organization_id, payment_id, signature_valid, processed_at, processing_error, received_at"
        )
        .order("received_at", { ascending: false })
        .limit(100),
    ]);

    res.json({
      data: {
        deliveries: deliveries.data || [],
        provider_events: providerEvents.data || [],
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/webhooks/deliveries/:id/retry",
  requireAdminRole("superadmin", "admin"),
  async (req, res, next) => {
    try {
      const body = z.object({ reason: reasonSchema }).parse(req.body);
      await retryDeliveryById(req.params.id);
      await logAdminAction(req, {
        action: "webhook.delivery.retry",
        targetType: "webhook_delivery",
        targetId: req.params.id,
        targetLabel: req.params.id,
        reason: body.reason,
        stateAfter: { retried: true, delivery_id: req.params.id },
      });
      res.json({ data: { id: req.params.id, retried: true } });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/webhooks/provider-events/:id/reprocess",
  requireAdminRole("superadmin", "admin"),
  async (req, res, next) => {
    try {
      const body = z.object({ reason: reasonSchema }).parse(req.body);
      const { data: event, error } = await supabaseAdmin
        .from("provider_events")
        .select("id, provider, provider_event_id, event_type, payload, processed_at")
        .eq("id", req.params.id)
        .maybeSingle();

      if (error) throw error;
      if (!event) {
        res.status(404).json({ error: { type: "not_found", message: "Evento nao encontrado." } });
        return;
      }

      const payload = (event.payload || {}) as {
        txid?: string;
        external_id?: string | null;
        status?: string;
      };
      const payment = await getPaymentByProviderReference({
        txid: payload.txid,
        externalId: payload.external_id || null,
      });

      if (!payment) {
        res.status(409).json({
          error: { type: "invalid_request", message: "Pagamento correspondente nao encontrado." },
        });
        return;
      }

      await markPixPaymentSucceeded(payment);
      await supabaseAdmin
        .from("provider_events")
        .update({
          processed_at: new Date().toISOString(),
          processing_error: null,
          payment_id: payment.id,
          organization_id: payment.organization_id,
          environment: payment.environment,
        })
        .eq("id", event.id);

      await logAdminAction(req, {
        action: "provider_event.reprocess",
        targetType: "provider_event",
        targetId: event.id,
        targetLabel: event.provider_event_id,
        reason: body.reason,
        stateBefore: { processed_at: event.processed_at },
        stateAfter: { payment_id: payment.id },
      });

      res.json({ data: { event_id: event.id, payment_id: payment.id } });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/security", async (req, res, next) => {
  try {
    const environment = req.platformAdmin!.environment;
    const { data: logs, error } = await supabaseAdmin
      .from("api_logs")
      .select("id, method, path, status_code, duration_ms, ip_address, organization_id, created_at")
      .eq("environment", environment)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    res.json({ data: logs || [] });
  } catch (err) {
    next(err);
  }
});

router.get("/audit", async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("admin_audit_log")
      .select(
        "id, admin_email, action, target_type, target_id, target_label, reason, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    next(err);
  }
});

router.get("/settings", async (_req, res, next) => {
  try {
    const maintenance = await getMaintenanceSettings(true);
    res.json({ data: { maintenance } });
  } catch (err) {
    next(err);
  }
});

router.put("/settings/maintenance", requireAdminRole("superadmin"), async (req, res, next) => {
  try {
    const body = z
      .object({
        enabled: z.boolean(),
        message: z.string().max(500).optional(),
        scope: z.enum(["all", "api", "dashboard"]).optional(),
        allow_admins: z.boolean().optional(),
        reason: reasonSchema,
      })
      .parse(req.body);

    const before = await getMaintenanceSettings(true);

    const { data: value, error } = await supabaseAdmin
      .from("platform_settings")
      .upsert(
        {
          key: "maintenance",
          value: {
            enabled: body.enabled,
            message: body.message ?? before.message,
            scope: body.scope ?? before.scope,
            allow_admins: body.allow_admins ?? before.allow_admins,
          },
        },
        { onConflict: "key" }
      )
      .select("value")
      .single();

    if (error) throw error;

    invalidateMaintenanceCache();

    await logAdminAction(req, {
      action: body.enabled ? "maintenance.enable" : "maintenance.disable",
      targetType: "platform_settings",
      targetId: "maintenance",
      targetLabel: "maintenance",
      reason: body.reason,
      stateBefore: before as unknown as Record<string, unknown>,
      stateAfter: (value?.value || {}) as Record<string, unknown>,
    });

    res.json({ data: value?.value || body });
  } catch (err) {
    next(err);
  }
});

export default router;
