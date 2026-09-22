import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import {
  requireAdminRole,
  logAdminAction,
} from "../middleware/admin-auth.js";

const router = Router();
const reasonSchema = z.string().trim().min(10).max(500);

function sanitizeSearch(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[,()"'\\*:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return cleaned || null;
}

router.post(
  "/users/:id/status",
  requireAdminRole("superadmin", "admin"),
  async (req, res, next) => {
    try {
      const body = z.object({
        status: z.enum(["active", "suspended", "banned", "disabled"]),
        reason: reasonSchema,
      }).parse(req.body);

      const { data: before } = await supabaseAdmin
        .from("users")
        .select("id, email, full_name, status, status_reason, status_changed_at")
        .eq("id", req.params.id)
        .maybeSingle();

      if (!before) {
        res.status(404).json({ error: { type: "not_found", message: "Usuário não encontrado." } });
        return;
      }
      if (before.status === body.status) {
        res.status(409).json({ error: { type: "invalid_request", message: `O usuário já está com status "${body.status}".` } });
        return;
      }

      const { data: after, error } = await supabaseAdmin
        .from("users")
        .update({
          status: body.status,
          status_reason: body.reason,
          status_changed_at: new Date().toISOString(),
          status_changed_by: req.platformAdmin!.userId,
        })
        .eq("id", req.params.id)
        .select("id, email, full_name, status, status_reason, status_changed_at")
        .single();

      if (error) throw error;

      await logAdminAction(req, {
        action: `user.status.${body.status}`,
        targetType: "user",
        targetId: before.id,
        targetLabel: before.email,
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

router.get("/users", async (req, res, next) => {
  try {
    const search = sanitizeSearch(req.query.search as string | undefined);

    let query = supabaseAdmin
      .from("users")
      .select("id, email, full_name, status, status_reason, status_changed_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (search) query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);

    const { data: users, error } = await query;
    if (error) throw error;

    const ids = (users || []).map((u) => u.id);
    const { data: memberships } = ids.length
      ? await supabaseAdmin
          .from("organization_members")
          .select("user_id, role, organizations(id, name, slug, status)")
          .in("user_id", ids)
      : { data: [] as unknown[] };

    res.json({ data: { users: users || [], memberships: memberships || [] } });
  } catch (err) {
    next(err);
  }
});

router.get("/payments", async (req, res, next) => {
  try {
    const environment = req.platformAdmin!.environment;
    const status = req.query.status as string | undefined;
    const search = sanitizeSearch(req.query.search as string | undefined);

    let query = supabaseAdmin
      .from("payments")
      .select(
        "id, organization_id, amount, currency, status, payment_type, provider, provider_txid, fee_amount, created_at, organizations(name, slug)"
      )
      .eq("environment", environment)
      .order("created_at", { ascending: false })
      .limit(200);

    if (status && status !== "all") query = query.eq("status", status);
    if (search) query = query.or(`provider_txid.ilike.%${search}%,description.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ data: data || [] });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/payments/:id/release",
  requireAdminRole("superadmin", "admin"),
  async (req, res, next) => {
    try {
      const body = z.object({ reason: reasonSchema }).parse(req.body);
      const environment = req.platformAdmin!.environment;
      const { data: payment } = await supabaseAdmin
        .from("payments")
        .select("id, organization_id, amount, currency, status, environment, description")
        .eq("id", req.params.id)
        .eq("environment", environment)
        .maybeSingle();

      if (!payment) {
        res.status(404).json({ error: { type: "not_found", message: "Pagamento não encontrado." } });
        return;
      }
      if (payment.status !== "succeeded") {
        res.status(409).json({ error: { type: "invalid_request", message: "Só pagamentos confirmados podem ter saldo liberado." } });
        return;
      }

      const { data, error } = await supabaseAdmin.rpc("fluxpay_release_payment_balance", {
        p_payment_id: payment.id,
        p_organization_id: payment.organization_id,
        p_environment: environment,
      });
      if (error) throw error;

      await logAdminAction(req, {
        action: "payment.balance.release",
        targetType: "payment",
        targetId: payment.id,
        targetLabel: payment.description || payment.id,
        reason: body.reason,
        stateBefore: { available_on_before: "future_or_mixed", environment },
        stateAfter: { release: data, environment },
      });

      res.json({ data: { payment_id: payment.id, release: Array.isArray(data) ? data[0] : data } });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/refunds", async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("refunds")
      .select(
        "id, organization_id, payment_id, amount, currency, status, reason, created_at, organizations(name, slug)"
      )
      .eq("environment", req.platformAdmin!.environment)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    next(err);
  }
});

router.get("/disputes", async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("disputes")
      .select(
        "id, organization_id, payment_id, amount, currency, status, reason, evidence_due_by, created_at, organizations(name, slug)"
      )
      .eq("environment", req.platformAdmin!.environment)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    next(err);
  }
});

export default router;
