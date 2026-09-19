import { Router } from "express";
import { z } from "zod";
import { apiKeyAuth, requireSecretKey } from "../middleware/auth.js";
import { idempotencyCheck } from "../middleware/idempotency.js";
import {
  createPayment,
  getPayment,
  listPayments,
  cancelPayment,
  createRefund,
} from "../services/payments.js";

const router = Router();

const createPaymentSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().length(3).optional(),
  customer_id: z.string().uuid().optional(),
  description: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
  payment_method: z
    .object({
      type: z.string(),
      token: z.string().optional(),
    })
    .optional(),
  idempotency_key: z.string().max(255).optional(),
});

router.post("/", apiKeyAuth, requireSecretKey, idempotencyCheck, async (req, res, next) => {
  try {
    const body = createPaymentSchema.parse(req.body);
    const idempotencyKey = (req as any).idempotencyKey || body.idempotency_key;

    const payment = await createPayment(req.auth!.organizationId, req.auth!.environment, {
      ...body,
      idempotency_key: idempotencyKey,
    });

    res.status(201).json({ data: payment });
  } catch (err) {
    next(err);
  }
});

router.get("/", apiKeyAuth, async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const starting_after = req.query.starting_after as string | undefined;
    const status = req.query.status as string | undefined;

    const result = await listPayments(req.auth!.organizationId, req.auth!.environment, {
      limit,
      starting_after,
      status,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", apiKeyAuth, async (req, res, next) => {
  try {
    const payment = await getPayment(req.auth!.organizationId, req.params.id);
    res.json({ data: payment });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/cancel", apiKeyAuth, requireSecretKey, async (req, res, next) => {
  try {
    const payment = await cancelPayment(req.auth!.organizationId, req.params.id);
    res.json({ data: payment });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/refund", apiKeyAuth, requireSecretKey, async (req, res, next) => {
  try {
    const schema = z.object({
      amount: z.number().int().positive().optional(),
      reason: z.string().max(500).optional(),
      metadata: z.record(z.unknown()).optional(),
    });
    const body = schema.parse(req.body);

    const refund = await createRefund(req.auth!.organizationId, req.params.id, body);
    res.status(201).json({ data: refund });
  } catch (err) {
    next(err);
  }
});

export default router;
