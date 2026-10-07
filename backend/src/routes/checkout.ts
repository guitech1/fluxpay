import { Router } from "express";
import { z } from "zod";
import { apiKeyAuth, requireSecretKey } from "../middleware/auth.js";
import {
  createCheckoutSession,
  getCheckoutSession,
  payCheckoutSessionWithPix,
  getCheckoutSessionStatus,
  simulateCheckoutPayment,
} from "../services/checkout.js";

const router = Router();

const createSessionSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().length(3).optional(),
  customer_id: z.string().uuid().optional(),
  success_url: z.string().url(),
  cancel_url: z.string().url(),
  line_items: z
    .array(
      z.object({
        name: z.string(),
        amount: z.number().int().positive(),
        quantity: z.number().int().positive().optional(),
      })
    )
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

function publicAppearance(metadata: unknown) {
  const meta = (metadata || {}) as Record<string, unknown>;
  const color =
    typeof meta.appearance_color === "string" &&
    /^#[0-9A-Fa-f]{6}$/.test(meta.appearance_color)
      ? meta.appearance_color
      : null;
  const theme =
    typeof meta.appearance_theme === "string" &&
    ["default", "dark", "light", "brand"].includes(meta.appearance_theme)
      ? meta.appearance_theme
      : "default";
  const message =
    typeof meta.appearance_message === "string"
      ? meta.appearance_message.replace(/[<>]/g, "").slice(0, 200)
      : null;
  return { color, theme, message };
}

router.post("/sessions", apiKeyAuth, requireSecretKey, async (req, res, next) => {
  try {
    const body = createSessionSchema.parse(req.body);
    const session = await createCheckoutSession(
      req.auth!.organizationId,
      req.auth!.environment,
      body
    );
    res.status(201).json({ data: session });
  } catch (err) {
    next(err);
  }
});

router.get("/sessions/:id", async (req, res, next) => {
  try {
    const session = await getCheckoutSession(req.params.id);
    res.json({
      data: {
        id: session.id,
        amount: session.amount,
        currency: session.currency,
        status: session.status,
        line_items: session.line_items,
        expires_at: session.expires_at,
        appearance: publicAppearance(session.metadata),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/sessions/:id/pay", async (req, res, next) => {
  try {
    const { payment } = await payCheckoutSessionWithPix(req.params.id);

    res.status(201).json({
      data: {
        payment_id: payment.id,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        pix_copy_paste: payment.pix_copy_paste ?? null,
        pix_qr_code_base64: payment.pix_qr_code_base64 ?? null,
        expires_at: payment.expires_at ?? null,
        simulated: payment.provider === "sandbox",
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/sessions/:id/simulate-payment", async (req, res, next) => {
  try {
    res.json({ data: await simulateCheckoutPayment(req.params.id) });
  } catch (err) {
    next(err);
  }
});

router.get("/sessions/:id/status", async (req, res, next) => {
  try {
    res.json({ data: await getCheckoutSessionStatus(req.params.id) });
  } catch (err) {
    next(err);
  }
});

export default router;
