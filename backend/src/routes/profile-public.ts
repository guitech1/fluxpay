import { Router } from "express";
import { getPublicProfile } from "../services/public-profile.js";

const router = Router();

router.get("/u/:slug", async (req, res, next) => {
  try {
    const data = await getPublicProfile(req.params.slug);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
