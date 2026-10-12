import { Router } from "express";
import { z } from "zod";
import { sessionAuth, requireRole } from "../middleware/session-auth.js";
import {
  getOwnProfileSettings,
  updatePublicProfile,
} from "../services/public-profile.js";

const router = Router();
router.use(sessionAuth);

router.get("/profile", async (req, res, next) => {
  try {
    const data = await getOwnProfileSettings(req.dashboardAuth!.organizationId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.patch("/profile", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const schema = z.object({
      public_display_name: z.string().max(80).optional(),
      public_bio: z.string().max(500).optional(),
      public_work: z.string().max(120).optional(),
      public_avatar_url: z.string().url().nullable().optional().or(z.literal("")),
      public_profile_enabled: z.boolean().optional(),
      slug: z.string().min(3).max(64).optional(),
    });
    const body = schema.parse(req.body);
    const avatar =
      body.public_avatar_url === "" ? null : body.public_avatar_url;
    const data = await updatePublicProfile(req.dashboardAuth!.organizationId, {
      ...body,
      public_avatar_url: avatar,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
