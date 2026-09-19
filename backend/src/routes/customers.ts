import { Router } from "express";
import { z } from "zod";
import { apiKeyAuth, requireSecretKey } from "../middleware/auth.js";
import { createCustomer, getCustomer, listCustomers } from "../services/customers.js";

const router = Router();

const createCustomerSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().max(255).optional(),
  phone: z.string().max(50).optional(),
  document: z.string().max(50).optional(),
  external_id: z.string().max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
});

router.post("/", apiKeyAuth, requireSecretKey, async (req, res, next) => {
  try {
    const body = createCustomerSchema.parse(req.body);
    const customer = await createCustomer(
      req.auth!.organizationId,
      req.auth!.environment,
      body
    );
    res.status(201).json({ data: customer });
  } catch (err) {
    next(err);
  }
});

router.get("/", apiKeyAuth, requireSecretKey, async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const result = await listCustomers(req.auth!.organizationId, req.auth!.environment, {
      limit,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", apiKeyAuth, requireSecretKey, async (req, res, next) => {
  try {
    const customer = await getCustomer(
      req.auth!.organizationId,
      req.params.id,
      req.auth!.environment
    );
    res.json({ data: customer });
  } catch (err) {
    next(err);
  }
});

export default router;
