import { Router } from "express";
import { z } from "zod";
import { sessionAuth, requireRole } from "../middleware/session-auth.js";
import { createPaymentLink, listPaymentLinks } from "../services/payment-links.js";

const router = Router();
router.use(sessionAuth);

router.post("/payment-links", requireRole("owner", "admin", "developer"), async (req, res, next) => {
  try {
    const schema = z.object({
      amount: z.number().int().min(100, "O valor minimo e R$ 1,00."),
      description: z.string().max(200).optional(),
      expires_in_minutes: z.number().int().min(5).max(10080).optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      theme: z.enum(["default", "dark", "light", "brand"]).optional(),
      message: z.string().max(200).optional(),
    });
    const body = schema.parse(req.body);
    const link = await createPaymentLink(
      req.dashboardAuth!.organizationId,
      req.dashboardAuth!.environment,
      body
    );
    res.status(201).json({ data: link });
  } catch (err) {
    next(err);
  }
});

router.get("/payment-links", requireRole("owner", "admin", "developer", "viewer"), async (req, res, next) => {
  try {
    const links = await listPaymentLinks(
      req.dashboardAuth!.organizationId,
      req.dashboardAuth!.environment,
      40
    );
    res.json({ data: links });
  } catch (err) {
    next(err);
  }
});

export default router;
