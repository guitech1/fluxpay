/**
 * Cartao virtual da Carteira Digital — emissao pela subconta documentada.
 * GET/POST /api/shops/{id}/card (via virtual-card service).
 * Validacao de carteira aprovada + saldo minimo R$ 100 no ledger FluxPay.
 * Mensagens amigaveis; nunca expor nome do fornecedor ao cliente.
 */
import { Router } from "express";
import { z } from "zod";
import { sessionAuth, requireRole } from "../middleware/session-auth.js";
import {
  getVirtualCardForOrg,
  requestVirtualCardForOrg,
  getVirtualCardDetailsForOrg,
  rechargeVirtualCardForOrg,
} from "../services/virtual-card.js";

const router = Router();
router.use(sessionAuth);

router.get("/", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const auth = req.dashboardAuth!;
    const card = await getVirtualCardForOrg({
      organizationId: auth.organizationId,
      environment: auth.environment,
    });
    res.json({
      data: {
        issued: card.issued,
        status: card.status,
        last4: card.last4,
        printed_name: card.printed_name,
        balance_cents: card.balance_cents,
        can_create: card.can_request,
        can_request: card.can_request,
        min_balance_to_create_cents: card.min_balance_cents,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/request", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const auth = req.dashboardAuth!;
    const card = await requestVirtualCardForOrg({
      organizationId: auth.organizationId,
      environment: auth.environment,
    });
    res.status(201).json({
      data: {
        issued: card.issued,
        status: card.status,
        last4: card.last4,
        printed_name: card.printed_name,
        balance_cents: card.balance_cents,
        can_create: card.can_request,
        can_request: card.can_request,
        min_balance_to_create_cents: card.min_balance_cents,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/details", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const auth = req.dashboardAuth!;
    // Dados sensiveis apenas para o titular autenticado. Nunca logar o corpo.
    const details = await getVirtualCardDetailsForOrg({
      organizationId: auth.organizationId,
    });
    res.json({
      data: {
        number: details.number,
        cvv: details.cvv,
        expiry: details.expiry,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/recharges", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const auth = req.dashboardAuth!;
    const schema = z.object({
      amount_cents: z.number().int().min(100),
      idempotency_key: z.string().min(8).max(128).optional(),
    });
    const body = schema.parse(req.body);
    const result = await rechargeVirtualCardForOrg({
      organizationId: auth.organizationId,
      environment: auth.environment,
      amountCents: body.amount_cents,
      idempotencyKey: body.idempotency_key,
    });
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
