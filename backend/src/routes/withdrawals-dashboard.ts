import { Router } from "express";
import { z } from "zod";
import { sessionAuth, requireRole } from "../middleware/session-auth.js";
import {
  requestWithdrawal,
  listWithdrawals,
  getWithdrawal,
  publicWithdrawalView,
  type PixKeyType,
} from "../services/withdrawals.js";

const router = Router();

router.use(sessionAuth);

router.post("/", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const schema = z.object({
      amount: z.number().int().min(600, "Valor minimo de saque: R$ 6,00."),
      pix_key: z.string().min(1).max(500),
      pix_key_type: z.enum(["cpf", "cnpj", "email", "phone", "random", "qrc"]),
      correlation_id: z.string().min(1).max(120).optional(),
    });
    const body = schema.parse(req.body);
    const withdrawal = await requestWithdrawal({
      organizationId: req.dashboardAuth!.organizationId,
      environment: req.dashboardAuth!.environment,
      userId: req.dashboardAuth!.userId,
      amountCents: body.amount,
      pixKey: body.pix_key,
      pixKeyType: body.pix_key_type as PixKeyType,
      correlationId: body.correlation_id,
    });
    res.status(201).json({ data: publicWithdrawalView(withdrawal) });
  } catch (err) {
    next(err);
  }
});

router.get("/", requireRole("owner", "admin", "developer", "viewer"), async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const result = await listWithdrawals(
      req.dashboardAuth!.organizationId,
      req.dashboardAuth!.environment,
      { status, limit }
    );
    res.json({ data: result.data.map(publicWithdrawalView), has_more: result.has_more });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requireRole("owner", "admin", "developer", "viewer"), async (req, res, next) => {
  try {
    const w = await getWithdrawal(
      req.dashboardAuth!.organizationId,
      req.dashboardAuth!.environment,
      req.params.id
    );
    res.json({ data: publicWithdrawalView(w) });
  } catch (err) {
    next(err);
  }
});

export default router;
