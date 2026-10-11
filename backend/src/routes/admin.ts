import { Router } from "express";
import { platformAdminAuth } from "../middleware/admin-auth.js";
import orgsRouter from "./admin-orgs.js";
import usersPayRouter from "./admin-users-pay.js";
import platformRouter from "./admin-platform.js";
import acquirersRouter from "./admin-acquirers.js";

const router = Router();
router.use(platformAdminAuth);
router.use(orgsRouter);
router.use(usersPayRouter);
router.use(platformRouter);
router.use(acquirersRouter);

export default router;
