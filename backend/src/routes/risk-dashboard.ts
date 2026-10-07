import { Router } from "express";
import { sessionAuth } from "../middleware/session-auth.js";
import { computeRiskSignals } from "../services/risk-radar.js";

const router = Router();
router.use(sessionAuth);

router.get("/risk-radar", async (req, res, next) => {
  try {
    const data = await computeRiskSignals(
      req.dashboardAuth!.organizationId,
      req.dashboardAuth!.environment
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
