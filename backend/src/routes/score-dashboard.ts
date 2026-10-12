import { Router } from "express";
import { sessionAuth } from "../middleware/session-auth.js";
import { computeFluxPayScore } from "../services/score.js";

const router = Router();
router.use(sessionAuth);

router.get("/score", async (req, res, next) => {
  try {
    const score = await computeFluxPayScore(
      req.dashboardAuth!.organizationId,
      req.dashboardAuth!.environment
    );
    res.json({ data: score });
  } catch (err) {
    next(err);
  }
});

export default router;
