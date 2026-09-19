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

// Public endpoint for the hosted checkout page (no API key needed for GET by id)
router.get("/sessions/:id", async (req, res, next) => {
  try {
    const session = await getCheckoutSession(req.params.id);
    // Return limited public fields
    res.json({
      data: {
        id: session.id,
        amount: session.amount,
        currency: session.currency,
        status: session.status,
        line_items: session.line_items,
        expires_at: session.expires_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Pagina publica de checkout — quem chama e o cliente final do lojista,
// sem API key. Por isso estas rotas sao publicas e so devolvem campos
// publicos: nunca organization_id, provider_response ou dados internos.
// ============================================================

/** Gera (ou reaproveita) o PIX da sessao e devolve o QR Code. */
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
        // Diz a pagina de checkout que este PIX e de mentira (ambiente de
        // teste) — e o que libera o botao de simular a confirmacao.
        simulated: payment.provider === "sandbox",
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Confirma um PIX simulado. Existe SOMENTE para ambiente de teste com provider
 * sandbox; em qualquer outro caso o service devolve 404 (ver
 * services/checkout.ts). Em producao quem confirma e o webhook da NexusPag.
 */
router.post("/sessions/:id/simulate-payment", async (req, res, next) => {
  try {
    res.json({ data: await simulateCheckoutPayment(req.params.id) });
  } catch (err) {
    next(err);
  }
});

/** Polling do status (o PIX so confirma quando o webhook da NexusPag chega). */
router.get("/sessions/:id/status", async (req, res, next) => {
  try {
    res.json({ data: await getCheckoutSessionStatus(req.params.id) });
  } catch (err) {
    next(err);
  }
});

export default router;
