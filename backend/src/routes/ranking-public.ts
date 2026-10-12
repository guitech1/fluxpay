import { Router } from "express";
import { getRankingBoard } from "../services/ranking.js";

const router = Router();

/** Public ranking board — no auth required. */
router.get("/ranking", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const board = await getRankingBoard(limit);
    res.json({ data: board });
  } catch (err) {
    next(err);
  }
});

export default router;
