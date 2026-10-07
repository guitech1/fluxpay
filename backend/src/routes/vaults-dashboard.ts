import { Router } from "express";
import { z } from "zod";
import { sessionAuth, requireRole } from "../middleware/session-auth.js";
import {
  listVaults,
  createVault,
  moveVaultFunds,
  archiveVault,
} from "../services/vaults.js";

const router = Router();
router.use(sessionAuth);

router.get("/vaults", async (req, res, next) => {
  try {
    const data = await listVaults(
      req.dashboardAuth!.organizationId,
      req.dashboardAuth!.environment
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.post("/vaults", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(80),
      description: z.string().max(200).optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    });
    const body = schema.parse(req.body);
    const vault = await createVault(
      req.dashboardAuth!.organizationId,
      req.dashboardAuth!.environment,
      body
    );
    res.status(201).json({ data: vault });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/vaults/:id/allocate",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const schema = z.object({
        amount_cents: z.number().int().positive(),
        note: z.string().max(200).optional(),
      });
      const body = schema.parse(req.body);
      const result = await moveVaultFunds(
        req.dashboardAuth!.organizationId,
        req.dashboardAuth!.environment,
        req.params.id,
        "allocate",
        body.amount_cents,
        req.dashboardAuth!.userId,
        body.note
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/vaults/:id/release",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const schema = z.object({
        amount_cents: z.number().int().positive(),
        note: z.string().max(200).optional(),
      });
      const body = schema.parse(req.body);
      const result = await moveVaultFunds(
        req.dashboardAuth!.organizationId,
        req.dashboardAuth!.environment,
        req.params.id,
        "release",
        body.amount_cents,
        req.dashboardAuth!.userId,
        body.note
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/vaults/:id/archive",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const data = await archiveVault(
        req.dashboardAuth!.organizationId,
        req.dashboardAuth!.environment,
        req.params.id,
        req.dashboardAuth!.userId
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
