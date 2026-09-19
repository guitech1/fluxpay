import { Router } from "express";
import { apiKeyAuth } from "../middleware/auth.js";
import { getBalance } from "../services/balance.js";

const router = Router();

router.get("/", apiKeyAuth, async (req, res, next) => {
  try {
    const balance = await getBalance(req.auth!.organizationId, req.auth!.environment);
    res.json({ data: balance });
  } catch (err) {
    next(err);
  }
});

export default router;
