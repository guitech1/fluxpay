import { Router } from "express";
import { getControlRoomSnapshot } from "../services/control-room.js";
import type { Environment } from "../types/index.js";

const router = Router();

router.get("/control-room", async (req, res, next) => {
  try {
    const environment = (req.platformAdmin?.environment || "live") as Environment;
    const data = await getControlRoomSnapshot(environment);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
