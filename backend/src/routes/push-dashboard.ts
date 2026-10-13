import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { sessionAuth, requireRole } from "../middleware/session-auth.js";
import {
  upsertSubscription,
  removeSubscription,
  listUserSubscriptions,
  sendTestNotification,
  getVapidPublicKey,
} from "../services/push.js";

const router = Router();

const testLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      type: "rate_limit_error",
      message: "Demasiados testes de notificacao. Aguarde um minuto.",
    },
  },
});

router.use(sessionAuth);

router.get("/vapid-public-key", (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    res.status(503).json({
      error: {
        type: "config_error",
        message: "Notificacoes push ainda nao estao configuradas neste ambiente.",
      },
    });
    return;
  }
  res.json({ data: { publicKey: key } });
});

router.get("/status", async (req, res, next) => {
  try {
    const subs = await listUserSubscriptions(req.dashboardAuth!.userId);
    res.json({
      data: {
        configured: Boolean(getVapidPublicKey()),
        subscription_count: subs.length,
        has_subscription: subs.length > 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/subscribe", requireRole("owner", "admin", "developer", "viewer"), async (req, res, next) => {
  try {
    const schema = z.object({
      endpoint: z.string().url().max(2048),
      keys: z.object({
        p256dh: z.string().min(1).max(512),
        auth: z.string().min(1).max(512),
      }),
    });
    const body = schema.parse(req.body);
    await upsertSubscription({
      userId: req.dashboardAuth!.userId,
      organizationId: req.dashboardAuth!.organizationId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
    });
    res.status(201).json({ data: { subscribed: true } });
  } catch (err) {
    next(err);
  }
});

router.delete("/subscribe", requireRole("owner", "admin", "developer", "viewer"), async (req, res, next) => {
  try {
    const schema = z.object({ endpoint: z.string().url().max(2048) });
    const body = schema.parse(req.body);
    await removeSubscription(req.dashboardAuth!.userId, body.endpoint);
    res.json({ data: { unsubscribed: true } });
  } catch (err) {
    next(err);
  }
});

/**
 * Testes de demonstracao — nao criam cobranca, nao alteram saldo, nao disparam webhooks de pagamento.
 */
router.post(
  "/test",
  testLimiter,
  requireRole("owner", "admin", "developer"),
  async (req, res, next) => {
    try {
      const schema = z.object({
        kind: z.enum(["pix_generated", "sale_paid"]),
      });
      const body = schema.parse(req.body);

      let amountLabel: string | undefined;
      if (body.kind === "sale_paid") {
        const cents = 1000 + Math.floor(Math.random() * 90000);
        amountLabel = (cents / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });
      }

      const result = await sendTestNotification({
        userId: req.dashboardAuth!.userId,
        kind: body.kind === "pix_generated" ? "test_pix" : "test_sale",
        amountLabel,
      });

      res.json({
        data: {
          sent: result.sent,
          kind: body.kind,
          demo: true,
          amount_label: amountLabel || null,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
