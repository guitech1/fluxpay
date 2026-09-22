import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase.js";
import {
  platformAdminAuth,
  requireAdminRole,
  logAdminAction,
} from "../middleware/admin-auth.js";
import {
  getMaintenanceSettings,
  invalidateMaintenanceCache,
} from "../middleware/maintenance.js";
import { retryDeliveryById } from "../services/webhooks.js";
import { updateKycByAdmin } from "../services/kyc.js";
import {
  getPaymentByProviderReference,
  markPixPaymentSucceeded,
} from "../services/payments.js";

/**
 * API do painel administrativo da FluxPay (a plataforma inteira, nao uma
 * organizacao). Regras que valem para TODAS as rotas daqui:
 *
 * - Autorizacao server-side em platform_admins (middleware acima). O frontend
 *   nunca decide quem entra.
 * - `support` le, `admin` age sobre contas, `superadmin` mexe em configuracao
 *   global e na propria equipe.
 * - SEGREDO NENHUM sai daqui: api_keys nunca expoe key_hash, webhook_endpoints
 *   nunca expoe secret, payments nunca expoe provider_response (que carrega a
 *   resposta crua do adquirente), e nada de NEXUSPAG_*. As listas de colunas
 *   abaixo sao explicitas justamente por isso — nunca use select("*") aqui.
 * - Toda acao que muda alguma coisa exige motivo e vai para admin_audit_log.
 */

const router = Router();

router.use(platformAdminAuth);

const reasonSchema = z.string().trim().min(10).max(500);

/**
 * Limpa o termo de busca antes de interpola-lo num filtro `.or(...)`.
 *
 * O `or` do PostgREST e uma EXPRESSAO em texto: virgula separa condicoes,
 * parenteses agrupam, ponto separa coluna/operador/valor. Interpolar o termo
 * cru permitia reescrever a consulta a partir da caixa de busca — por exemplo
 * fechando a lista com uma virgula e acrescentando uma condicao sobre outra
 * coluna. Nao da para apagar dado (e service_role com colunas explicitas e
 * so SELECT), mas altera o resultado e vaza erro do banco na tela.
 *
 * Removemos os metacaracteres do filtro e o curinga `*` do ilike, e limitamos
 * o tamanho. Sobra exatamente o que uma busca precisa: texto.
 */
function sanitizeSearch(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[,()"'\\*:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return cleaned || null;
}

// ============================================================
// SESSAO / IDENTIDADE
// ============================================================
router.get("/me", (req, res) => {
  res.json({ data: req.platformAdmin });
});

// ============================================================
// VISAO GERAL DA PLATAFORMA
// ============================================================
router.get("/overview", async (req, res, next) => {
  try {
    const environment = req.platformAdmin!.environment;

    const [{ data: metrics }, { data: recentOrgs }, { data: recentActions }] = await Promise.all([
      supabaseAdmin.rpc("fluxpay_platform_overview", { p_environment: environment }),
      supabaseAdmin
        .from("organizations")
        .select("id, name, slug, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("admin_audit_log")
        .select("id, admin_email, action, target_type, target_label, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const maintenance = await getMaintenanceSettings(true);

    res.json({
      data: {
        environment,
        metrics: metrics || {},
        maintenance,
        recent_organizations: recentOrgs || [],
        recent_admin_actions: recentActions || [],
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// ORGANIZACOES
// ============================================================
router.get("/organizations", async (req, res, next) => {
  try {
    const search = sanitizeSearch(req.query.search as string | undefined);
    const status = req.query.status as string | undefined;

    let query = supabaseAdmin
      .from("organizations")
      .select(
        "id, name, slug, legal_name, document, email, country, status, status_reason, status_changed_at, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (status && status !== "all") query = query.eq("status", status);
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,slug.ilike.%${search}%,email.ilike.%${search}%,document.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ data: data || [] });
  } catch (err) {
    next(err);
  }
});

router.get("/organizations/:id", async (req, res, next) => {
  try {
    const environment = req.platformAdmin!.environment;
    const orgId = req.params.id;

    const { data: organization, error } = await supabaseAdmin
      .from("organizations")
      .select(
        "id, name, slug, legal_name, document, email, phone, website, country, timezone, default_currency, status, status_reason, status_changed_at, created_at, kyc_required, kyc_status, kyc_verified_at, kyc_document_type, kyc_document_masked, kyc_rejection_reason, kyc_required_at, kyc_required_by"
      )
      .eq("id", orgId)
      .maybeSingle();

    if (error) throw error;
    if (!organization) {
      res.status(404).json({ error: { type: "not_found", message: "Organizacao nao encontrada." } });
      return;
    }

    const [members, payments, balance, apiKeys, endpoints, logs, refunds, disputes] =
      await Promise.all([
        supabaseAdmin
          .from("organization_members")
          .select("id, role, created_at, users(id, email, full_name)")
          .eq("organization_id", orgId),
        supabaseAdmin
          .from("payments")
          .select("id, amount, currency, status, payment_type, fee_amount, created_at")
          .eq("organization_id", orgId)
          .eq("environment", environment)
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseAdmin
          .from("balance_transactions")
          .select("id, type, amount, net, fee, currency, description, created_at")
          .eq("organization_id", orgId)
          .eq("environment", environment)
          .order("created_at", { ascending: false })
          .limit(50),
        // Sem key_hash: o ADM ve que a chave existe, nunca o segredo.
        supabaseAdmin
          .from("api_keys")
          .select("id, name, key_type, environment, key_prefix, last_used_at, revoked_at, created_at")
          .eq("organization_id", orgId)
          .eq("environment", environment),
        // Sem secret, pelo mesmo motivo.
        supabaseAdmin
          .from("webhook_endpoints")
          .select("id, url, events, description, enabled, created_at")
          .eq("organization_id", orgId)
          .eq("environment", environment),
        supabaseAdmin
          .from("api_logs")
          .select("id, method, path, status_code, duration_ms, ip_address, created_at")
          .eq("organization_id", orgId)
          .eq("environment", environment)
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseAdmin
          .from("refunds")
          .select("id, payment_id, amount, currency, status, reason, created_at")
          .eq("organization_id", orgId)
          .eq("environment", environment)
          .order("created_at", { ascending: false })
          .limit(25),
        supabaseAdmin
          .from("disputes")
          .select("id, payment_id, amount, currency, status, reason, created_at")
          .eq("organization_id", orgId)
          .eq("environment", environment)
          .order("created_at", { ascending: false })
          .limit(25),
      ]);

    const { data: history } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id, admin_email, action, reason, state_before, state_after, created_at")
      .eq("target_type", "organization")
      .eq("target_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50);

    const txs = (balance.data || []) as { net: number; currency: string }[];
    const balanceByCurrency = txs.reduce<Record<string, number>>((acc, tx) => {
      acc[tx.currency] = (acc[tx.currency] || 0) + Number(tx.net || 0);
      return acc;
    }, {});

    res.json({
      data: {
        organization,
        environment,
        members: members.data || [],
        payments: payments.data || [],
        balance_transactions: balance.data || [],
        balance_by_currency: balanceByCurrency,
        api_keys: apiKeys.data || [],
        webhook_endpoints: endpoints.data || [],
        api_logs: logs.data || [],
        refunds: refunds.data || [],
        disputes: disputes.data || [],
        admin_history: history || [],
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Muda o estado de uma conta: suspender, banir, desativar, reativar ou voltar
 * para pendente. Motivo obrigatorio, estado anterior e posterior gravados.
 */
router.post(
  "/organizations/:id/status",
  requireAdminRole("superadmin", "admin"),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          status: z.enum(["active", "pending", "suspended", "banned", "disabled"]),
          reason: reasonSchema,
        })
        .parse(req.body);

      const { data: before } = await supabaseAdmin
        .from("organizations")
        .select("id, name, slug, status, status_reason")
        .eq("id", req.params.id)
        .maybeSingle();

      if (!before) {
        res.status(404).json({ error: { type: "not_found", message: "Organizacao nao encontrada." } });
        return;
      }

      if (before.status === body.status) {
        res.status(409).json({
          error: { type: "invalid_request", message: `A conta ja esta com status "${body.status}".` },
        });
        return;
      }

      const { data: after, error } = await supabaseAdmin
        .from("organizations")
        .update({
          status: body.status,
          status_reason: body.reason,
          status_changed_at: new Date().toISOString(),
          status_changed_by: req.platformAdmin!.userId,
        })
        .eq("id", req.params.id)
        .select("id, name, slug, status, status_reason, status_changed_at")
        .single();

      if (error) throw error;

      await logAdminAction(req, {
        action: `organization.status.${body.status}`,
        targetType: "organization",
        targetId: before.id,
        targetLabel: before.name,
        reason: body.reason,
        stateBefore: { status: before.status, status_reason: before.status_reason },
        stateAfter: { status: after.status, status_reason: after.status_reason },
      });

      res.json({ data: after });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// USUARIOS
// ============================================================
router.post(
  "/users/:id/status",
  requireAdminRole("superadmin", "admin"),
  async (req, res, next) => {
    try {
      const body = z.object({
        status: z.enum(["active", "suspended", "banned", "disabled"]),
        reason: reasonSchema,
      }).parse(req.body);

      const { data: before } = await supabaseAdmin
        .from("users")
        .select("id, email, full_name, status, status_reason, status_changed_at")
        .eq("id", req.params.id)
        .maybeSingle();

      if (!before) {
        res.status(404).json({ error: { type: "not_found", message: "Usuário não encontrado." } });
        return;
      }
      if (before.status === body.status) {
        res.status(409).json({ error: { type: "invalid_request", message: `O usuário já está com status "${body.status}".` } });
        return;
      }

      const { data: after, error } = await supabaseAdmin
        .from("users")
        .update({
          status: body.status,
          status_reason: body.reason,
          status_changed_at: new Date().toISOString(),
          status_changed_by: req.platformAdmin!.userId,
        })
        .eq("id", req.params.id)
        .select("id, email, full_name, status, status_reason, status_changed_at")
        .single();

      if (error) throw error;

      await logAdminAction(req, {
        action: `user.status.${body.status}`,
        targetType: "user",
        targetId: before.id,
        targetLabel: before.email,
        reason: body.reason,
        stateBefore: { status: before.status, status_reason: before.status_reason },
        stateAfter: { status: after.status, status_reason: after.status_reason },
      });

      res.json({ data: after });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/users", async (req, res, next) => {
  try {
    const search = sanitizeSearch(req.query.search as string | undefined);

    let query = supabaseAdmin
      .from("users")
      .select("id, email, full_name, status, status_reason, status_changed_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (search) query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);

    const { data: users, error } = await query;
    if (error) throw error;

    const ids = (users || []).map((u) => u.id);
    const { data: memberships } = ids.length
      ? await supabaseAdmin
          .from("organization_members")
          .select("user_id, role, organizations(id, name, slug, status)")
          .in("user_id", ids)
      : { data: [] as unknown[] };

    res.json({ data: { users: users || [], memberships: memberships || [] } });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// PAGAMENTOS / REEMBOLSOS / DISPUTAS (visao global)
// ============================================================
router.get("/payments", async (req, res, next) => {
  try {
    const environment = req.platformAdmin!.environment;
    const status = req.query.status as string | undefined;
    const search = sanitizeSearch(req.query.search as string | undefined);

    let query = supabaseAdmin
      .from("payments")
      .select(
        "id, organization_id, amount, currency, status, payment_type, provider, provider_txid, fee_amount, created_at, organizations(name, slug)"
      )
      .eq("environment", environment)
      .order("created_at", { ascending: false })
      .limit(200);

    if (status && status !== "all") query = query.eq("status", status);
    if (search) query = query.or(`provider_txid.ilike.%${search}%,description.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ data: data || [] });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/payments/:id/release",
  requireAdminRole("superadmin", "admin"),
  async (req, res, next) => {
    try {
      const body = z.object({ reason: reasonSchema }).parse(req.body);
      const environment = req.platformAdmin!.environment;
      const { data: payment } = await supabaseAdmin
        .from("payments")
        .select("id, organization_id, amount, currency, status, environment, description")
        .eq("id", req.params.id)
        .eq("environment", environment)
        .maybeSingle();

      if (!payment) {
        res.status(404).json({ error: { type: "not_found", message: "Pagamento não encontrado." } });
        return;
      }
      if (payment.status !== "succeeded") {
        res.status(409).json({ error: { type: "invalid_request", message: "Só pagamentos confirmados podem ter saldo liberado." } });
        return;
      }

      const { data, error } = await supabaseAdmin.rpc("fluxpay_release_payment_balance", {
        p_payment_id: payment.id,
        p_organization_id: payment.organization_id,
        p_environment: environment,
      });
      if (error) throw error;

      await logAdminAction(req, {
        action: "payment.balance.release",
        targetType: "payment",
        targetId: payment.id,
        targetLabel: payment.description || payment.id,
        reason: body.reason,
        stateBefore: { available_on_before: "future_or_mixed", environment },
        stateAfter: { release: data, environment },
      });

      res.json({ data: { payment_id: payment.id, release: Array.isArray(data) ? data[0] : data } });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/refunds", async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("refunds")
      .select(
        "id, organization_id, payment_id, amount, currency, status, reason, created_at, organizations(name, slug)"
      )
      .eq("environment", req.platformAdmin!.environment)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    next(err);
  }
});

router.get("/disputes", async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("disputes")
      .select(
        "id, organization_id, payment_id, amount, currency, status, reason, evidence_due_by, created_at, organizations(name, slug)"
      )
      .eq("environment", req.platformAdmin!.environment)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// WEBHOOKS: entregas de SAIDA e eventos de ENTRADA do adquirente
// ============================================================
router.get("/webhooks", async (_req, res, next) => {
  try {
    const [deliveries, providerEvents] = await Promise.all([
      supabaseAdmin
        .from("webhook_deliveries")
        .select(
          "id, status, attempt_count, next_retry_at, response_status, created_at, webhook_endpoint_id, webhook_events(type, organization_id)"
        )
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("provider_events")
        .select(
          "id, provider, provider_event_id, event_type, organization_id, payment_id, signature_valid, processed_at, processing_error, received_at"
        )
        .order("received_at", { ascending: false })
        .limit(100),
    ]);

    res.json({
      data: {
        deliveries: deliveries.data || [],
        provider_events: providerEvents.data || [],
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Reenvia uma entrega de webhook de SAIDA. Seguro por construcao: o lojista
 * recebe o mesmo evento de novo e todo consumidor de webhook precisa tratar
 * repeticao (a entrega ja podia ter sido repetida pelo retry automatico).
 */
router.post(
  "/webhooks/deliveries/:id/retry",
  requireAdminRole("superadmin", "admin"),
  async (req, res, next) => {
    try {
      const body = z.object({ reason: reasonSchema }).parse(req.body);

      const { data: delivery } = await supabaseAdmin
        .from("webhook_deliveries")
        .select("id, status, attempt_count, response_status")
        .eq("id", req.params.id)
        .maybeSingle();

      if (!delivery) {
        res.status(404).json({ error: { type: "not_found", message: "Entrega nao encontrada." } });
        return;
      }

      if (delivery.status === "success") {
        res.status(409).json({
          error: {
            type: "invalid_request",
            message: "Esta entrega ja teve sucesso; reenviar duplicaria o evento sem necessidade.",
          },
        });
        return;
      }

      await retryDeliveryById(req.params.id);

      const { data: after } = await supabaseAdmin
        .from("webhook_deliveries")
        .select("id, status, attempt_count, response_status")
        .eq("id", req.params.id)
        .maybeSingle();

      await logAdminAction(req, {
        action: "webhook.delivery.retry",
        targetType: "webhook_delivery",
        targetId: req.params.id,
        reason: body.reason,
        stateBefore: delivery,
        stateAfter: after,
      });

      res.json({ data: after });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Reprocessa um evento de ENTRADA da NexusPag que ficou sem efeito — o caso
 * real e o webhook ter chegado antes da linha em payments existir.
 *
 * So reprocessa quando e comprovadamente seguro:
 *   - a assinatura daquele evento foi validada na chegada (signature_valid);
 *   - o evento e payment.confirmed com status "paid" (unico evento de PIX,
 *     conforme docs/nexuspag-api.md);
 *   - existe um pagamento com aquele txid;
 *   - o pagamento ainda nao esta "succeeded".
 * Fora disso, recusa em vez de adivinhar — creditar o ledger duas vezes seria
 * pior do que exigir uma conferencia manual.
 */
router.post(
  "/webhooks/provider-events/:id/reprocess",
  requireAdminRole("superadmin", "admin"),
  async (req, res, next) => {
    try {
      const body = z.object({ reason: reasonSchema }).parse(req.body);

      const { data: event } = await supabaseAdmin
        .from("provider_events")
        .select("id, event_type, payload, signature_valid, processed_at, processing_error")
        .eq("id", req.params.id)
        .maybeSingle();

      if (!event) {
        res.status(404).json({ error: { type: "not_found", message: "Evento nao encontrado." } });
        return;
      }

      if (!event.signature_valid) {
        res.status(409).json({
          error: {
            type: "invalid_request",
            message: "Evento sem assinatura validada na chegada: nao e seguro reprocessar.",
          },
        });
        return;
      }

      const payload = (event.payload || {}) as {
        txid?: string;
        external_id?: string;
        status?: string;
        event?: string;
      };
      const eventName = payload.event || event.event_type;

      if (eventName !== "payment.confirmed" || payload.status !== "paid" || !payload.txid) {
        res.status(409).json({
          error: {
            type: "invalid_request",
            message: "So eventos payment.confirmed com status 'paid' e txid podem ser reprocessados.",
          },
        });
        return;
      }

      // Mesma busca do webhook e da reconciliacao automatica: txid OU
      // external_id. Manter as tres consistentes evita que o ADM diga
      // "nenhum pagamento com esse txid" para um caso que o job ja resolveria.
      const payment = await getPaymentByProviderReference({
        txid: payload.txid,
        externalId: payload.external_id,
      });

      if (!payment) {
        res.status(409).json({
          error: {
            type: "invalid_request",
            message: "Nenhum pagamento com esse txid — nao ha o que reprocessar.",
          },
        });
        return;
      }

      if (payment.status === "succeeded") {
        res.status(409).json({
          error: { type: "invalid_request", message: "O pagamento ja esta confirmado." },
        });
        return;
      }

      await markPixPaymentSucceeded(payment);

      await supabaseAdmin
        .from("provider_events")
        .update({
          processed_at: new Date().toISOString(),
          processing_error: null,
          payment_id: payment.id,
          organization_id: payment.organization_id,
          environment: payment.environment,
        })
        .eq("id", event.id);

      await logAdminAction(req, {
        action: "webhook.provider_event.reprocess",
        targetType: "provider_event",
        targetId: event.id,
        targetLabel: payload.txid,
        reason: body.reason,
        stateBefore: { payment_status: payment.status, processing_error: event.processing_error },
        stateAfter: { payment_status: "succeeded", payment_id: payment.id },
      });

      res.json({ data: { payment_id: payment.id, status: "succeeded" } });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// SEGURANCA E OPERACAO
// ============================================================
router.get("/security", async (req, res, next) => {
  try {
    const environment = req.platformAdmin!.environment;

    const [errors, unauthorized, invalidSignatures, admins] = await Promise.all([
      supabaseAdmin
        .from("api_logs")
        .select("id, method, path, status_code, ip_address, organization_id, created_at")
        .eq("environment", environment)
        .gte("status_code", 500)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("api_logs")
        .select("id, method, path, status_code, ip_address, organization_id, created_at")
        .eq("environment", environment)
        .in("status_code", [401, 403])
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("provider_events")
        .select("id, provider, provider_event_id, signature_valid, received_at")
        .eq("signature_valid", false)
        .order("received_at", { ascending: false })
        .limit(25),
      supabaseAdmin
        .from("platform_admins")
        .select("user_id, role, note, created_at, users(email, full_name)")
        .order("created_at", { ascending: true }),
    ]);

    res.json({
      data: {
        server_errors: errors.data || [],
        auth_failures: unauthorized.data || [],
        invalid_signatures: invalidSignatures.data || [],
        admins: admins.data || [],
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// AUDITORIA
// ============================================================
router.get("/audit", async (req, res, next) => {
  try {
    const action = req.query.action as string | undefined;
    const targetId = req.query.target_id as string | undefined;

    let query = supabaseAdmin
      .from("admin_audit_log")
      .select(
        "id, admin_email, action, target_type, target_id, target_label, reason, state_before, state_after, ip_address, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(300);

    if (action && action !== "all") query = query.ilike("action", `${action}%`);
    if (targetId) query = query.eq("target_id", targetId);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ data: data || [] });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// CONFIGURACOES GLOBAIS / MANUTENCAO
// ============================================================
router.get("/settings", async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("platform_settings")
      .select("key, value, updated_at")
      .order("key");

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    next(err);
  }
});

router.put("/settings/maintenance", requireAdminRole("superadmin"), async (req, res, next) => {
  try {
    const body = z
      .object({
        enabled: z.boolean(),
        message: z.string().trim().min(5).max(500),
        allow_admins: z.boolean().default(true),
        scope: z.enum(["all", "api", "dashboard"]).default("all"),
        reason: reasonSchema,
      })
      .parse(req.body);

    const before = await getMaintenanceSettings(true);

    const value = {
      enabled: body.enabled,
      message: body.message,
      allow_admins: body.allow_admins,
      scope: body.scope,
    };

    const { error } = await supabaseAdmin
      .from("platform_settings")
      .upsert(
        {
          key: "maintenance",
          value,
          updated_at: new Date().toISOString(),
          updated_by: req.platformAdmin!.userId,
        },
        { onConflict: "key" }
      );

    if (error) throw error;

    invalidateMaintenanceCache();

    await logAdminAction(req, {
      action: body.enabled ? "platform.maintenance.enable" : "platform.maintenance.disable",
      targetType: "platform",
      targetId: "maintenance",
      reason: body.reason,
      stateBefore: before,
      stateAfter: value,
    });

    res.json({ data: value });
  } catch (err) {
    next(err);
  }
});

export default router;
