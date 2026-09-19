import { Router } from "express";
import { z } from "zod";
import { sessionAuth, requireRole } from "../middleware/session-auth.js";
import { supabaseAdmin } from "../config/supabase.js";
import { generateApiKey } from "../utils/crypto.js";
import { createWebhookEndpoint } from "../services/webhooks.js";
import {
  createPayment,
  createRefund,
  cancelPayment,
  simulateSandboxPayment,
} from "../services/payments.js";
import {
  createCustomer,
  getCustomer,
  updateCustomer,
  deleteCustomer,
} from "../services/customers.js";
import { AppError } from "../middleware/error.js";
import { inScopeOrNull } from "../utils/scope.js";

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
// COBRANCA PIX PELO PAINEL
//
// Esta rota e o que faltava para existir uma experiencia de "Nova cobranca"
// no painel: antes, so dava para criar cobranca via API key em /v1/payments.
// Ela usa exatamente o mesmo caminho de codigo (services/payments.createPayment
// -> provider), entao em producao a cobranca e criada de verdade na NexusPag
// e em teste no provider sandbox — sem nenhum atalho especifico de painel.
//
// Os campos aceitos sao os que a API de PIX da NexusPag realmente entende
// (valor, descricao, external_id e expiracao — ver docs/nexuspag-api.md,
// POST /api/pix/create), mais o vinculo opcional com um cliente do FluxPay.
// ============================================================
router.post("/payments", requireRole("owner", "admin", "developer"), async (req, res, next) => {
  try {
    const schema = z.object({
      // Centavos, como todo o core. R$ 1,00 e o minimo aceito pela NexusPag.
      amount: z.number().int().min(100, "O valor minimo de uma cobranca PIX e R$ 1,00."),
      description: z.string().max(200).optional(),
      /** Sua referencia (pedido, fatura). Vira external_id na NexusPag. */
      reference: z.string().max(120).optional(),
      customer_id: z.string().uuid().optional(),
      /** Validade em minutos: 5 min a 7 dias. */
      expires_in_minutes: z.number().int().min(5).max(10080).optional(),
    });
    const body = schema.parse(req.body);

    const payment = await createPayment(
      req.dashboardAuth!.organizationId,
      req.dashboardAuth!.environment,
      {
        amount: body.amount,
        currency: "BRL",
        customer_id: body.customer_id,
        description: body.description,
        payment_method: { type: "pix" },
        // external_id na NexusPag e chave de idempotencia: reenviar a mesma
        // referencia devolve a cobranca existente em vez de criar outra.
        idempotency_key: body.reference || undefined,
        expires_in_seconds: (body.expires_in_minutes || 60) * 60,
        metadata: { created_from: "dashboard" },
      }
    );

    res.status(201).json({ data: payment });
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

    const refund = await createRefund(
      req.dashboardAuth!.organizationId,
      req.params.id,
      req.dashboardAuth!.environment,
      body
    );
    res.status(201).json({ data: refund });
  } catch (err) {
    next(err);
  }
});

router.post("/payments/:id/cancel", requireRole("owner", "admin", "developer"), async (req, res, next) => {
  try {
    const payment = await cancelPayment(
      req.dashboardAuth!.organizationId,
      req.params.id,
      req.dashboardAuth!.environment
    );
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
      // Trava explicita de ambiente: simulateSandboxPayment ja forca "test" na
      // consulta, mas recusar aqui deixa claro que a rota nao existe para quem
      // esta operando em producao.
      if (req.dashboardAuth!.environment !== "test") {
        throw new AppError(404, "not_found", "Recurso nao encontrado.");
      }

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

// ============================================================
// API KEYS — consulta por id e revogacao
//
// Antes, o painel revogava a chave direto pelo Supabase client
// (`update({revoked_at}).eq("id", ...)`). A RLS confere se a pessoa pertence a
// organizacao, mas NAO sabe qual ambiente o painel esta mostrando: uma chave
// de producao podia ser revogada a partir da visao de testes, bastando o id.
// Agora a validacao e organizacao + ambiente + id, no servidor. A permissao
// de UPDATE(revoked_at) da migration 010 continua existindo — nao foi mexida
// no banco — mas deixou de ser o caminho usado pela interface.
//
// key_hash NUNCA sai daqui. As colunas sao listadas uma a uma por isso.
// ============================================================
const API_KEY_COLUMNS =
  "id, organization_id, name, key_type, environment, key_prefix, last_used_at, expires_at, revoked_at, created_at";

async function findApiKeyInScope(organizationId: string, environment: string, id: string) {
  const { data } = await supabaseAdmin
    .from("api_keys")
    .select(API_KEY_COLUMNS)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .maybeSingle();

  // 404 e nao 403: confirmar que o id existe "mas e do outro ambiente" ja e
  // informacao demais.
  const key = inScopeOrNull(data as { organization_id: string; environment: string } | null, organizationId, environment);
  if (!key) throw new AppError(404, "not_found", "Chave nao encontrada neste ambiente.");
  return key;
}

router.get("/api-keys/:id", async (req, res, next) => {
  try {
    const key = await findApiKeyInScope(
      req.dashboardAuth!.organizationId,
      req.dashboardAuth!.environment,
      req.params.id
    );
    res.json({ data: key });
  } catch (err) {
    next(err);
  }
});

router.post("/api-keys/:id/revoke", requireRole("owner", "admin", "developer"), async (req, res, next) => {
  try {
    const organizationId = req.dashboardAuth!.organizationId;
    const environment = req.dashboardAuth!.environment;

    await findApiKeyInScope(organizationId, environment, req.params.id);

    const { data, error } = await supabaseAdmin
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .eq("organization_id", organizationId)
      .eq("environment", environment)
      .is("revoked_at", null)
      .select(API_KEY_COLUMNS)
      .maybeSingle();

    if (error) throw error;

    // Sem linha afetada = ja estava revogada. Revogar duas vezes nao e erro.
    if (!data) {
      const current = await findApiKeyInScope(organizationId, environment, req.params.id);
      res.json({ data: current, already_revoked: true });
      return;
    }

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// WEBHOOK ENDPOINTS — edicao e remocao com escopo de ambiente
//
// Mesmo raciocinio das chaves: o painel editava/apagava direto pelo Supabase
// client com `.eq("id", ...)`. O segredo HMAC nunca e lido nem devolvido.
// ============================================================
const WEBHOOK_COLUMNS = "id, organization_id, environment, url, events, description, enabled, created_at";

async function findEndpointInScope(organizationId: string, environment: string, id: string) {
  const { data } = await supabaseAdmin
    .from("webhook_endpoints")
    .select(WEBHOOK_COLUMNS)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .maybeSingle();

  const endpoint = inScopeOrNull(data as { organization_id: string; environment: string } | null, organizationId, environment);
  if (!endpoint) throw new AppError(404, "not_found", "Endpoint nao encontrado neste ambiente.");
  return endpoint;
}

router.patch("/webhooks/endpoints/:id", requireRole("owner", "admin", "developer"), async (req, res, next) => {
  try {
    const schema = z
      .object({
        url: z.string().url().optional(),
        events: z.array(z.string()).min(1).optional(),
        description: z.string().max(255).nullable().optional(),
        enabled: z.boolean().optional(),
      })
      .refine((v) => Object.keys(v).length > 0, { message: "Informe ao menos um campo." });

    const body = schema.parse(req.body);
    const organizationId = req.dashboardAuth!.organizationId;
    const environment = req.dashboardAuth!.environment;

    await findEndpointInScope(organizationId, environment, req.params.id);

    const { data, error } = await supabaseAdmin
      .from("webhook_endpoints")
      .update(body)
      .eq("id", req.params.id)
      .eq("organization_id", organizationId)
      .eq("environment", environment)
      .select(WEBHOOK_COLUMNS)
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.delete("/webhooks/endpoints/:id", requireRole("owner", "admin", "developer"), async (req, res, next) => {
  try {
    const organizationId = req.dashboardAuth!.organizationId;
    const environment = req.dashboardAuth!.environment;

    await findEndpointInScope(organizationId, environment, req.params.id);

    const { error } = await supabaseAdmin
      .from("webhook_endpoints")
      .delete()
      .eq("id", req.params.id)
      .eq("organization_id", organizationId)
      .eq("environment", environment);

    if (error) throw error;
    res.json({ data: { id: req.params.id, deleted: true } });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// CLIENTES — CRUD com escopo de ambiente garantido no servidor
//
// A RLS permite ao painel escrever em `customers` (nao e tabela de ledger),
// mas ela nao conhece o ambiente selecionado. Passando pelo backend, o
// organization_id e o environment vem da sessao ja conferida, nunca do corpo
// da requisicao.
// ============================================================
const customerSchema = z.object({
  email: z.string().email().optional().or(z.literal("")),
  name: z.string().max(255).optional(),
  phone: z.string().max(50).optional(),
  document: z.string().max(50).optional(),
  external_id: z.string().max(255).optional(),
});

/** Campo vazio vindo de formulario vira null, nao string vazia. */
function normalizeCustomer(body: z.infer<typeof customerSchema>) {
  return {
    email: body.email?.trim() || undefined,
    name: body.name?.trim() || undefined,
    phone: body.phone?.trim() || undefined,
    document: body.document?.trim() || undefined,
    external_id: body.external_id?.trim() || undefined,
  };
}

router.post("/customers", requireRole("owner", "admin", "developer"), async (req, res, next) => {
  try {
    const body = customerSchema.parse(req.body);
    const customer = await createCustomer(
      req.dashboardAuth!.organizationId,
      req.dashboardAuth!.environment,
      normalizeCustomer(body)
    );
    res.status(201).json({ data: customer });
  } catch (err) {
    next(err);
  }
});

router.get("/customers/:id", async (req, res, next) => {
  try {
    const customer = await getCustomer(
      req.dashboardAuth!.organizationId,
      req.params.id,
      req.dashboardAuth!.environment
    );
    res.json({ data: customer });
  } catch (err) {
    next(err);
  }
});

router.patch("/customers/:id", requireRole("owner", "admin", "developer"), async (req, res, next) => {
  try {
    const body = customerSchema.parse(req.body);
    const customer = await updateCustomer(
      req.dashboardAuth!.organizationId,
      req.params.id,
      req.dashboardAuth!.environment,
      normalizeCustomer(body)
    );
    res.json({ data: customer });
  } catch (err) {
    next(err);
  }
});

router.delete("/customers/:id", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    await deleteCustomer(
      req.dashboardAuth!.organizationId,
      req.params.id,
      req.dashboardAuth!.environment
    );
    res.json({ data: { id: req.params.id, deleted: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
