import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { sessionAuth, requireRole } from "../middleware/session-auth.js";
import { AppError } from "../middleware/error.js";
import { getBalance } from "../services/balance.js";
import {
  createCard,
  getCardByOrganization,
  lookupRecipient,
  transfer,
  blockCard,
  unblockCard,
  presentCard,
} from "../services/fluxpay-card.js";

const router = Router();

router.use(sessionAuth);

const passwordAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      type: "rate_limit_error",
      message: "Muitas tentativas. Aguarde alguns minutos.",
    },
  },
});

function clientIp(req: {
  headers: Record<string, unknown>;
  ip?: string;
}): string | null {
  const nf = req.headers["x-nf-client-connection-ip"];
  if (typeof nf === "string" && nf) return nf;
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0]?.trim() || null;
  return req.ip || null;
}

router.get("/", async (req, res, next) => {
  try {
    const auth = req.dashboardAuth!;
    const card = await getCardByOrganization(auth.organizationId);

    let availableCents = 0;
    if (card && (card.status === "approved" || card.status === "blocked")) {
      const balance = await getBalance(auth.organizationId, auth.environment);
      const brl = balance.available.find((b) => b.currency === "BRL");
      availableCents = brl?.amount ?? 0;
    }

    res.json({
      status: card ? card.status : "not_created",
      card: card ? presentCard(card) : null,
      balance: { available: availableCents, currency: "BRL" },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/status", async (req, res, next) => {
  try {
    const auth = req.dashboardAuth!;
    const card = await getCardByOrganization(auth.organizationId);
    res.json({
      status: card ? card.status : "not_created",
      card: card ? presentCard(card) : null,
    });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  full_name: z.string().min(3).max(120),
  phone: z.string().min(8).max(20),
  password: z.string().min(8).max(128),
  password_confirmation: z.string().min(8).max(128),
});

router.post("/create", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const auth = req.dashboardAuth!;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        400,
        "validation_error",
        "Dados invalidos. Verifique nome, telefone e senha."
      );
    }

    const card = await createCard({
      organizationId: auth.organizationId,
      userId: auth.userId,
      fullName: parsed.data.full_name,
      phone: parsed.data.phone,
      password: parsed.data.password,
      passwordConfirmation: parsed.data.password_confirmation,
      ipAddress: clientIp(req),
    });

    res.status(201).json({ status: card.status, card: presentCard(card) });
  } catch (err) {
    next(err);
  }
});

router.get("/recipient/:cardNumber", async (req, res, next) => {
  try {
    const auth = req.dashboardAuth!;
    const cardNumber = String(req.params.cardNumber || "");
    const recipient = await lookupRecipient(cardNumber);
    if (!recipient) {
      throw new AppError(404, "not_found", "Carteira destinataria nao encontrada.");
    }

    const own = await getCardByOrganization(auth.organizationId);
    if (own?.card_number && own.card_number === cardNumber.replace(/\D/g, "")) {
      throw new AppError(
        400,
        "validation_error",
        "Este e o numero da sua propria carteira."
      );
    }

    res.json({
      full_name: recipient.full_name,
      card_number_masked: recipient.card_number_masked,
      status: recipient.status,
    });
  } catch (err) {
    next(err);
  }
});

const transferSchema = z.object({
  card_number: z.string().min(16).max(24),
  amount_cents: z.number().int().positive(),
  password: z.string().min(8).max(128),
  idempotency_key: z.string().min(8).max(128),
});

router.post(
  "/transfer",
  requireRole("owner", "admin"),
  passwordAttemptLimiter,
  async (req, res, next) => {
    try {
      const auth = req.dashboardAuth!;
      const parsed = transferSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          "validation_error",
          "Dados da transferencia invalidos."
        );
      }

      const result = await transfer({
        organizationId: auth.organizationId,
        userId: auth.userId,
        destinationCardNumber: parsed.data.card_number,
        amountCents: parsed.data.amount_cents,
        password: parsed.data.password,
        idempotencyKey: parsed.data.idempotency_key,
        environment: auth.environment,
        ipAddress: clientIp(req),
      });

      res.status(result.already_existed ? 200 : 201).json({ transaction: result });
    } catch (err) {
      next(err);
    }
  }
);

router.post("/block", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const auth = req.dashboardAuth!;
    const card = await getCardByOrganization(auth.organizationId);
    if (!card) throw new AppError(404, "not_found", "Carteira nao encontrada.");

    const updated = await blockCard({
      cardId: card.id,
      actorUserId: auth.userId,
      actorType: "user",
      organizationId: auth.organizationId,
      reason: typeof req.body?.reason === "string" ? req.body.reason : null,
      ipAddress: clientIp(req),
    });

    res.json({ status: updated.status, card: presentCard(updated) });
  } catch (err) {
    next(err);
  }
});

router.post("/unblock", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const auth = req.dashboardAuth!;
    const card = await getCardByOrganization(auth.organizationId);
    if (!card) throw new AppError(404, "not_found", "Carteira nao encontrada.");

    const updated = await unblockCard({
      cardId: card.id,
      actorUserId: auth.userId,
      actorType: "user",
      organizationId: auth.organizationId,
      ipAddress: clientIp(req),
    });

    res.json({ status: updated.status, card: presentCard(updated) });
  } catch (err) {
    next(err);
  }
});

export default router;
