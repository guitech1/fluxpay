/**
 * Proxy seguro para cartao virtual NexusPag.
 * Credenciais ficam apenas no backend. Dados sensiveis (CVV/numero) so sob demanda e nunca em logs.
 */
import { Router } from "express";
import { z } from "zod";
import { sessionAuth, requireRole } from "../middleware/session-auth.js";
import {
  getNexusPagCard,
  requestNexusPagCard,
  getNexusPagCardDetails,
  createNexusPagCardRecharge,
} from "../providers/nexuspag.js";
import { AppError } from "../middleware/error.js";

const router = Router();
router.use(sessionAuth);

router.get("/", requireRole("owner", "admin"), async (_req, res, next) => {
  try {
    const card = await getNexusPagCard();
    res.json({
      data: {
        status: card.status,
        last4: card.last4,
        printed_name: card.printedName,
        balance_cents: card.balanceCents,
        can_create: card.canCreate,
        min_balance_to_create_cents: card.minBalanceToCreateCents,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/request", requireRole("owner", "admin"), async (_req, res, next) => {
  try {
    const card = await requestNexusPagCard();
    res.status(201).json({
      data: {
        status: card.status,
        last4: card.last4,
        printed_name: card.printedName,
        balance_cents: card.balanceCents,
        can_create: card.canCreate,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/details", requireRole("owner", "admin"), async (_req, res, next) => {
  try {
    // Atencao: retorna dados sensiveis apenas para o titular autenticado.
    // Nunca logar o corpo desta resposta.
    const details = await getNexusPagCardDetails();
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
    const schema = z.object({
      amount_cents: z.number().int().min(100),
      idempotency_key: z.string().min(8).max(128).optional(),
    });
    const body = schema.parse(req.body);
    const result = await createNexusPagCardRecharge({
      amountCents: body.amount_cents,
      idempotencyKey: body.idempotency_key,
    });
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
