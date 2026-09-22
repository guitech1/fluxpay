import { Router } from "express";
import { z } from "zod";
import {
  platformAdminAuth,
  requireAdminRole,
  logAdminAction,
} from "../middleware/admin-auth.js";
import {
  adminSetKycRequired,
  adminApproveKyc,
  adminRejectKyc,
  adminResetKyc,
  getOrganizationKyc,
  getLatestVerification,
} from "../services/kyc.js";

const router = Router();

router.use(platformAdminAuth);

const reasonSchema = z.string().trim().min(5).max(500);

/**
 * GET  /admin-api/organizations/:id/kyc
 * POST /admin-api/organizations/:id/kyc
 *   body: { kyc_required?: boolean, action?: 'approve'|'reject'|'reset', reason?: string, note?: string }
 */
router.get("/organizations/:id/kyc", async (req, res, next) => {
  try {
    const organization = await getOrganizationKyc(req.params.id);
    const verification = await getLatestVerification(req.params.id);
    res.json({ data: { organization, verification } });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/organizations/:id/kyc",
  requireAdminRole("superadmin", "admin"),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          kyc_required: z.boolean().optional(),
          action: z.enum(["approve", "reject", "reset"]).optional(),
          reason: reasonSchema.optional(),
          note: z.string().trim().max(500).optional(),
        })
        .parse(req.body);

      const orgId = req.params.id;
      const before = await getOrganizationKyc(orgId);
      let after = before;

      if (typeof body.kyc_required === "boolean") {
        after = await adminSetKycRequired({
          organizationId: orgId,
          required: body.kyc_required,
          adminUserId: req.platformAdmin!.userId,
        });
        await logAdminAction(req, {
          action: body.kyc_required ? "organization.kyc.require" : "organization.kyc.unrequire",
          targetType: "organization",
          targetId: orgId,
          targetLabel: orgId,
          reason: body.reason || (body.kyc_required ? "Exigir KYC" : "Remover exigencia de KYC"),
          stateBefore: { kyc_required: before.kyc_required, kyc_status: before.kyc_status },
          stateAfter: { kyc_required: after.kyc_required, kyc_status: after.kyc_status },
        });
      }

      if (body.action === "approve") {
        after = await adminApproveKyc({
          organizationId: orgId,
          adminUserId: req.platformAdmin!.userId,
          note: body.note || body.reason,
        });
        await logAdminAction(req, {
          action: "organization.kyc.approve",
          targetType: "organization",
          targetId: orgId,
          targetLabel: orgId,
          reason: body.note || body.reason || "Aprovacao manual de KYC",
          stateBefore: { kyc_status: before.kyc_status },
          stateAfter: { kyc_status: after.kyc_status },
        });
      } else if (body.action === "reject") {
        if (!body.reason) {
          res.status(400).json({
            error: { type: "validation_error", message: "Informe o motivo da rejeicao." },
          });
          return;
        }
        after = await adminRejectKyc({
          organizationId: orgId,
          adminUserId: req.platformAdmin!.userId,
          reason: body.reason,
        });
        await logAdminAction(req, {
          action: "organization.kyc.reject",
          targetType: "organization",
          targetId: orgId,
          targetLabel: orgId,
          reason: body.reason,
          stateBefore: { kyc_status: before.kyc_status },
          stateAfter: { kyc_status: after.kyc_status },
        });
      } else if (body.action === "reset") {
        if (!body.reason) {
          res.status(400).json({
            error: { type: "validation_error", message: "Informe o motivo do reset." },
          });
          return;
        }
        after = await adminResetKyc({
          organizationId: orgId,
          adminUserId: req.platformAdmin!.userId,
          reason: body.reason,
        });
        await logAdminAction(req, {
          action: "organization.kyc.reset",
          targetType: "organization",
          targetId: orgId,
          targetLabel: orgId,
          reason: body.reason,
          stateBefore: { kyc_status: before.kyc_status },
          stateAfter: { kyc_status: after.kyc_status },
        });
      }

      const verification = await getLatestVerification(orgId);
      res.json({ data: { organization: after, verification } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
