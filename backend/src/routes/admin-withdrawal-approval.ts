import { Router } from "express";
import { z } from "zod";
import { platformAdminAuth } from "../middleware/admin-auth.js";
import {
  getRequiresManualWithdrawalApproval,
  setRequiresManualWithdrawalApproval,
} from "../services/withdrawal-approval.js";

const router = Router();

router.use(platformAdminAuth);

router.get("/organizations/:orgId/withdrawal-approval", async (req, res, next) => {
  try {
    const enabled = await getRequiresManualWithdrawalApproval(req.params.orgId);
    res.json({
      data: {
        organization_id: req.params.orgId,
        requires_manual_withdrawal_approval: enabled,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/organizations/:orgId/withdrawal-approval", async (req, res, next) => {
  try {
    const schema = z.object({
      enabled: z.boolean(),
      reason: z.string().max(500).optional(),
    });
    const body = schema.parse(req.body);
    const adminUserId = (req as any).platformAdmin?.userId || (req as any).adminAuth?.userId;
    if (!adminUserId) {
      res.status(401).json({ error: { type: "authentication_error", message: "Admin nao autenticado." } });
      return;
    }
    const result = await setRequiresManualWithdrawalApproval({
      organizationId: req.params.orgId,
      enabled: body.enabled,
      adminUserId,
      reason: body.reason,
      ipAddress:
        (typeof req.headers["x-nf-client-connection-ip"] === "string"
          ? req.headers["x-nf-client-connection-ip"]
          : null) || req.ip || null,
    });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
