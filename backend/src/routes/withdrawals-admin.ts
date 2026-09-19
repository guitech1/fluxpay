import { Router } from "express";
import { z } from "zod";
import { platformAdminAuth, requireAdminRole, logAdminAction } from "../middleware/admin-auth.js";
import {
  listAllWithdrawals,
  approveAndExecuteWithdrawal,
  rejectWithdrawal,
  publicWithdrawalView,
} from "../services/withdrawals.js";

const router = Router();

router.use(platformAdminAuth);

const reasonSchema = z.string().trim().min(10).max(500);

router.get("/", requireAdminRole("superadmin", "admin", "support"), async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const organizationId =
      typeof req.query.organization_id === "string" ? req.query.organization_id : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const rows = await listAllWithdrawals({ status, organizationId, limit });
    res.json({
      data: rows.map((w) => ({
        ...publicWithdrawalView(w),
        organization_id: w.organization_id,
        provider_withdrawal_id: w.provider_withdrawal_id,
        provider_status: w.provider_status,
        reviewed_by: w.reviewed_by,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/approve", requireAdminRole("superadmin", "admin"), async (req, res, next) => {
  try {
    const body = z.object({ reason: reasonSchema, note: z.string().max(500).optional() }).parse(req.body);
    const updated = await approveAndExecuteWithdrawal({
      withdrawalId: req.params.id,
      adminUserId: req.platformAdmin!.userId,
      note: body.note || body.reason,
    });
    await logAdminAction(req, {
      action: "withdrawal.approve",
      targetType: "withdrawal_request",
      targetId: updated.id,
      reason: body.reason,
      stateAfter: {
        organization_id: updated.organization_id,
        amount: updated.amount,
        status: updated.status,
      },
    });
    res.json({
      data: {
        ...publicWithdrawalView(updated),
        organization_id: updated.organization_id,
        provider_withdrawal_id: updated.provider_withdrawal_id,
        provider_status: updated.provider_status,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/reject", requireAdminRole("superadmin", "admin"), async (req, res, next) => {
  try {
    const body = z.object({ reason: reasonSchema }).parse(req.body);
    const updated = await rejectWithdrawal({
      withdrawalId: req.params.id,
      adminUserId: req.platformAdmin!.userId,
      reason: body.reason,
    });
    await logAdminAction(req, {
      action: "withdrawal.reject",
      targetType: "withdrawal_request",
      targetId: updated.id,
      reason: body.reason,
      stateAfter: {
        organization_id: updated.organization_id,
        amount: updated.amount,
      },
    });
    res.json({
      data: {
        ...publicWithdrawalView(updated),
        organization_id: updated.organization_id,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
