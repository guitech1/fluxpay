import { Router } from "express";
import { platformAdminAuth } from "../middleware/admin-auth.js";
import orgsRouter from "./admin-orgs.js";
import usersPayRouter from "./admin-users-pay.js";
import platformRouter from "./admin-platform.js";

const router = Router();
router.use(platformAdminAuth);
router.use(orgsRouter);
router.use(usersPayRouter);
router.use(platformRouter);

export default router;
