import { Router } from "express";
import { z } from "zod";
import { sessionAuth, requireRole } from "../middleware/session-auth.js";
import {
  setPixPin,
  verifyPixPin,
  setThemePreference,
  getDigitalAccountSummary,
} from "../services/digital-account.js";

const router = Router();
router.use(sessionAuth);

router.get("/summary", requireRole("owner", "admin", "developer", "viewer"), async (req, res, next) => {
  try {
    const summary = await getDigitalAccountSummary(req.dashboardAuth!.organizationId);
    res.json({ data: summary });
  } catch (err) {
    next(err);
  }
});

router.post("/pix-pin", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const schema = z.object({
      pix_pin: z.string().min(4).max(8),
      pix_pin_confirmation: z.string().min(4).max(8),
    });
    const body = schema.parse(req.body);
    await setPixPin({
      organizationId: req.dashboardAuth!.organizationId,
      userId: req.dashboardAuth!.userId,
      pixPin: body.pix_pin,
      pixPinConfirmation: body.pix_pin_confirmation,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post("/pix-pin/verify", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const schema = z.object({ pix_pin: z.string().min(4).max(8) });
    const body = schema.parse(req.body);
    await verifyPixPin({
      organizationId: req.dashboardAuth!.organizationId,
      pixPin: body.pix_pin,
    });
    res.json({ data: { valid: true } });
  } catch (err) {
    next(err);
  }
});

router.patch("/theme", requireRole("owner", "admin", "developer", "viewer"), async (req, res, next) => {
  try {
    const schema = z.object({ theme: z.enum(["dark", "light"]) });
    const body = schema.parse(req.body);
    await setThemePreference({
      organizationId: req.dashboardAuth!.organizationId,
      theme: body.theme,
    });
    res.json({ data: { theme: body.theme } });
  } catch (err) {
    next(err);
  }
});

export default router;
