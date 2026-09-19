import { Router } from "express";
import { z } from "zod";
import { sessionAuth, requireRole } from "../middleware/session-auth.js";
import { supabaseAdmin } from "../config/supabase.js";
import { generateApiKey } from "../utils/crypto.js";
import { createWebhookEndpoint } from "../services/webhooks.js";
import { createRefund, cancelPayment, simulateSandboxPayment } from "../services/payments.js";

const router = Router();

router.use(sessionAuth);

// ============================================================
// API KEYS
// Criacao fica no backend porque exige gerar e fazer hash da chave —
// o painel nunca deve conseguir inserir um key_hash arbitrario direto
// no banco (ver migration 010, que revogou esse INSERT para authenticated).
// A revogacao (marcar revoked_at) o proprio painel faz direto pelo
// Supabase client, sem precisar desta rota.
// ============================================================
router.post("/api-keys", requireRole("owner", "admin", "developer"), async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(255),
      key_type: z.enum(["secret", "publishable"]),
    });
    const body = schema.parse(req.body);

    const { fullKey, prefix, hash } = generateApiKey(
      body.key_type,
      req.dashboardAuth!.environment
    );

    const { data, error } = await supabaseAdmin
      .from("api_keys")
      .insert({
        organization_id: req.dashboardAuth!.organizationId,
        name: body.name,
        key_type: body.key_type,
        environment: req.dashboardAuth!.environment,
        key_prefix: prefix,
        key_hash: hash,
        created_by: req.dashboardAuth!.userId,
      })
      .select("id, organization_id, name, key_type, environment, key_prefix, created_at")
      .single();

    if (error) throw error;

    // A chave completa (fullKey) so existe neste instante — nunca fica salva
    // em lugar nenhum alem do hash. O painel deve mostrar isso ao usuario
    // avisando que nao sera possivel ver de novo.
    res.status(201).json({ data: { ...data, key: fullKey } });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// WEBHOOK ENDPOINTS
// Criacao fica no backend porque gera o segredo HMAC (generateWebhookSecret).
// ============================================================
router.post("/webhooks/endpoints", requireRole("owner", "admin", "developer"), async (req, res, next) => {
  try {
    const schema = z.object({
      url: z.string().url(),
      events: z.array(z.string()).min(1),
      description: z.string().max(255).optional(),
    });
    const body = schema.parse(req.body);

    const endpoint = await createWebhookEndpoint(
      req.dashboardAuth!.organizationId,
      req.dashboardAuth!.environment,
      body.url,
      body.events,
      body.description
    );

    // endpoint.secret so existe neste instante — mostrar uma vez e avisar.
    res.status(201).json({ data: endpoint });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PAGAMENTOS: reembolso e cancelamento passam pelo backend porque
// chamam o adquirente (provider). A migration 010 removeu a permissao
// de UPDATE/INSERT direto em payments/refunds para o painel.
// ============================================================
router.post("/payments/:id/refund", requireRole("owner", "admin", "developer"), async (req, res, next) => {
  try {
    const schema = z.object({
      amount: z.number().int().positive().optional(),
      reason: z.string().max(500).optional(),
    });
    const body = schema.parse(req.body);

    const refund = await createRefund(req.dashboardAuth!.organizationId, req.params.id, body);
    res.status(201).json({ data: refund });
  } catch (err) {
    next(err);
  }
});

router.post("/payments/:id/cancel", requireRole("owner", "admin", "developer"), async (req, res, next) => {
  try {
    const payment = await cancelPayment(req.dashboardAuth!.organizationId, req.params.id);
    res.json({ data: payment });
  } catch (err) {
    next(err);
  }
});

/**
 * Confirma um PIX simulado (ambiente de teste, provider sandbox). Serve para
 * testar o fluxo completo — cobranca, ledger, webhook de saida e painel — sem
 * adquirente e sem dinheiro real. Em producao devolve 404.
 */
router.post(
  "/payments/:id/simulate-payment",
  requireRole("owner", "admin", "developer"),
  async (req, res, next) => {
    try {
      const payment = await simulateSandboxPayment(
        req.dashboardAuth!.organizationId,
        req.params.id
      );
      res.json({ data: payment });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// EQUIPE: convite por e-mail.
// Usa a API administrativa do Supabase Auth para criar o usuario (ou
// reaproveitar um ja existente) e ja retorna o user_id, permitindo
// vincular o convidado a organization_members na hora — sem esperar
// ele aceitar o convite por e-mail primeiro.
// ============================================================
router.post("/members/invite", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      role: z.enum(["admin", "developer", "viewer"]), // nunca convida direto como owner
    });
    const body = schema.parse(req.body);

    let userId: string | undefined;

    const { data: invited, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(body.email);

    if (inviteError) {
      // Usuario ja existe no Auth — busca o id dele para ainda assim adicionar a equipe.
      const { data: list } = await supabaseAdmin.auth.admin.listUsers();
      const existing = list?.users.find((u) => u.email === body.email);
      if (!existing) throw inviteError;
      userId = existing.id;
    } else {
      userId = invited.user?.id;
    }

    if (!userId) {
      res.status(500).json({ error: { type: "api_error", message: "Falha ao obter o usuario convidado." } });
      return;
    }

    const { data: member, error: memberError } = await supabaseAdmin
      .from("organization_members")
      .insert({
        organization_id: req.dashboardAuth!.organizationId,
        user_id: userId,
        role: body.role,
      })
      .select()
      .single();

    if (memberError) {
      if (memberError.code === "23505") {
        res.status(409).json({ error: { type: "invalid_request", message: "Este usuario ja faz parte da empresa." } });
        return;
      }
      throw memberError;
    }

    res.status(201).json({ data: member });
  } catch (err) {
    next(err);
  }
});

export default router;
