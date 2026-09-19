import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import {
  platformAdminAuth,
  requireAdminRole,
  logAdminAction,
} from "../middleware/admin-auth.js";

/**
 * Antecipa available_on das movimentações ainda "a liberar".
 * Só superadmin/admin; motivo obrigatório e audit log.
 */
const router = Router();
router.use(platformAdminAuth);

const reasonSchema = z.string().trim().min(10).max(500);

router.post(
  "/organizations/:id/balance/release",
  requireAdminRole("superadmin", "admin"),
  async (req, res, next) => {
    try {
      const body = z.object({ reason: reasonSchema }).parse(req.body);
      const organizationId = req.params.id;
      const environment = req.platformAdmin!.environment;
      const now = new Date().toISOString();

      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("id, name")
        .eq("id", organizationId)
        .maybeSingle();

      if (!org) {
        res.status(404).json({
          error: { type: "not_found", message: "Organizacao nao encontrada." },
        });
        return;
      }

      const { data: pending, error: listError } = await supabaseAdmin
        .from("balance_transactions")
        .select("id, net, currency, available_on, type, description")
        .eq("organization_id", organizationId)
        .eq("environment", environment)
        .gt("available_on", now);

      if (listError) throw listError;

      const ids = (pending || []).map((t) => t.id);
      if (ids.length === 0) {
        res.json({
          data: {
            released_count: 0,
            message: "Nenhuma movimentacao a liberar neste ambiente.",
          },
        });
        return;
      }

      const { data: updated, error: upError } = await supabaseAdmin
        .from("balance_transactions")
        .update({ available_on: now })
        .in("id", ids)
        .eq("organization_id", organizationId)
        .eq("environment", environment)
        .select("id, net, currency");

      if (upError) throw upError;

      const totalNet = (updated || []).reduce((s, t) => s + Number(t.net || 0), 0);

      await logAdminAction(req, {
        action: "organization.balance.release",
        targetType: "organization",
        targetId: organizationId,
        targetLabel: org.name,
        reason: body.reason,
        stateBefore: { pending_count: ids.length, pending_ids: ids },
        stateAfter: {
          released_count: (updated || []).length,
          released_net: totalNet,
          available_on: now,
          environment,
        },
      });

      res.json({
        data: {
          released_count: (updated || []).length,
          released_net: totalNet,
          currency: (updated || [])[0]?.currency || "BRL",
          environment,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
