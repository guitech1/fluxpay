import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import {
  requireAdminRole,
  logAdminAction,
} from "../middleware/admin-auth.js";
import {
  getMaintenanceSettings,
} from "../middleware/maintenance.js";

const router = Router();

const reasonSchema = z.string().trim().min(10).max(500);

function sanitizeSearch(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[,()"'\\*:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return cleaned || null;
}

router.get("/me", (req, res) => {
  res.json({ data: req.platformAdmin });
});

router.get("/overview", async (req, res, next) => {
  try {
    const environment = req.platformAdmin!.environment;

    const [{ data: metrics }, { data: recentOrgs }, { data: recentActions }] = await Promise.all([
      supabaseAdmin.rpc("fluxpay_platform_overview", { p_environment: environment }),
      supabaseAdmin
        .from("organizations")
        .select("id, name, slug, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("admin_audit_log")
        .select("id, admin_email, action, target_type, target_label, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const maintenance = await getMaintenanceSettings(true);

    res.json({
      data: {
        environment,
        metrics: metrics || {},
        maintenance,
        recent_organizations: recentOrgs || [],
        recent_admin_actions: recentActions || [],
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/organizations", async (req, res, next) => {
  try {
    const search = sanitizeSearch(req.query.search as string | undefined);
    const status = req.query.status as string | undefined;

    let query = supabaseAdmin
      .from("organizations")
      .select(
        "id, name, slug, legal_name, document, email, country, status, status_reason, status_changed_at, kyc_required, kyc_status, kyc_verified_at, kyc_document_masked, kyc_rejection_reason, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (status && status !== "all") query = query.eq("status", status);
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,slug.ilike.%${search}%,email.ilike.%${search}%,document.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ data: data || [] });
  } catch (err) {
    next(err);
  }
});

router.get("/organizations/:id", async (req, res, next) => {
  try {
    const environment = req.platformAdmin!.environment;
    const orgId = req.params.id;

    const { data: organization, error } = await supabaseAdmin
      .from("organizations")
      .select(
        "id, name, slug, legal_name, document, email, phone, website, country, timezone, default_currency, status, status_reason, status_changed_at, kyc_required, kyc_status, kyc_verified_at, kyc_document_type, kyc_document_masked, kyc_rejection_reason, created_at"
      )
      .eq("id", orgId)
      .maybeSingle();

    if (error) throw error;
    if (!organization) {
      res.status(404).json({ error: { type: "not_found", message: "Organizacao nao encontrada." } });
      return;
    }

    const [members, payments, balance, apiKeys, endpoints, logs, refunds, disputes] =
      await Promise.all([
        supabaseAdmin
          .from("organization_members")
          .select("id, role, created_at, users(id, email, full_name)")
          .eq("organization_id", orgId),
        supabaseAdmin
          .from("payments")
          .select("id, amount, currency, status, payment_type, fee_amount, created_at")
          .eq("organization_id", orgId)
          .eq("environment", environment)
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseAdmin
          .from("balance_transactions")
          .select("id, type, amount, net, fee, currency, description, created_at")
          .eq("organization_id", orgId)
          .eq("environment", environment)
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseAdmin
          .from("api_keys")
          .select("id, name, key_type, environment, key_prefix, last_used_at, revoked_at, created_at")
          .eq("organization_id", orgId)
          .eq("environment", environment),
        supabaseAdmin
          .from("webhook_endpoints")
          .select("id, url, events, description, enabled, created_at")
          .eq("organization_id", orgId)
          .eq("environment", environment),
        supabaseAdmin
          .from("api_logs")
          .select("id, method, path, status_code, duration_ms, ip_address, created_at")
          .eq("organization_id", orgId)
          .eq("environment", environment)
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseAdmin
          .from("refunds")
          .select("id, payment_id, amount, currency, status, reason, created_at")
          .eq("organization_id", orgId)
          .eq("environment", environment)
          .order("created_at", { ascending: false })
          .limit(25),
        supabaseAdmin
          .from("disputes")
          .select("id, payment_id, amount, currency, status, reason, created_at")
          .eq("organization_id", orgId)
          .eq("environment", environment)
          .order("created_at", { ascending: false })
          .limit(25),
      ]);

    const { data: history } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id, admin_email, action, reason, state_before, state_after, created_at")
      .eq("target_type", "organization")
      .eq("target_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50);

    const txs = (balance.data || []) as { net: number; currency: string }[];
    const balanceByCurrency = txs.reduce<Record<string, number>>((acc, tx) => {
      acc[tx.currency] = (acc[tx.currency] || 0) + Number(tx.net || 0);
      return acc;
    }, {});

    res.json({
      data: {
        organization,
        environment,
        members: members.data || [],
        payments: payments.data || [],
        balance_transactions: balance.data || [],
        balance_by_currency: balanceByCurrency,
        api_keys: apiKeys.data || [],
        webhook_endpoints: endpoints.data || [],
        api_logs: logs.data || [],
        refunds: refunds.data || [],
        disputes: disputes.data || [],
        admin_history: history || [],
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/organizations/:id/status",
  requireAdminRole("superadmin", "admin"),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          status: z.enum(["active", "pending", "suspended", "banned", "disabled"]),
          reason: reasonSchema,
        })
        .parse(req.body);

      const { data: before } = await supabaseAdmin
        .from("organizations")
        .select("id, name, slug, status, status_reason")
        .eq("id", req.params.id)
        .maybeSingle();

      if (!before) {
        res.status(404).json({ error: { type: "not_found", message: "Organizacao nao encontrada." } });
        return;
      }

      if (before.status === body.status) {
        res.status(409).json({
          error: { type: "invalid_request", message: `A conta ja esta com status "${body.status}".` },
        });
        return;
      }

      const { data: after, error } = await supabaseAdmin
        .from("organizations")
        .update({
          status: body.status,
          status_reason: body.reason,
          status_changed_at: new Date().toISOString(),
          status_changed_by: req.platformAdmin!.userId,
        })
        .eq("id", req.params.id)
        .select("id, name, slug, status, status_reason, status_changed_at")
        .single();

      if (error) throw error;

      await logAdminAction(req, {
        action: `organization.status.${body.status}`,
        targetType: "organization",
        targetId: before.id,
        targetLabel: before.name,
        reason: body.reason,
        stateBefore: { status: before.status, status_reason: before.status_reason },
        stateAfter: { status: after.status, status_reason: after.status_reason },
      });

      res.json({ data: after });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
