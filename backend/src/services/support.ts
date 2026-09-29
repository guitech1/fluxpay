import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";

export type SupportStatus = "open" | "in_progress" | "waiting_customer" | "resolved";
export type SupportSenderType = "customer" | "agent" | "system" | "assistant";
export type SupportMessageType = "text" | "system_event" | "assistant_reply" | "option_select";

const CONVERSATION_COLUMNS =
  "id, user_id, organization_id, subject, status, assigned_admin_id, environment, last_message_at, last_message_preview, customer_unread_count, agent_unread_count, created_at, updated_at, resolved_at";

const MESSAGE_COLUMNS =
  "id, conversation_id, sender_type, sender_id, message_type, content, metadata, read_at, created_at, updated_at";

function sanitizeContent(raw: string): string {
  return raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, 8000);
}

export async function createConversation(params: {
  userId: string;
  organizationId: string;
  environment: "test" | "live";
  subject: string;
  initialAssistantMessage?: string;
}) {
  const subject = sanitizeContent(params.subject) || "Atendimento";

  const { data: conv, error } = await supabaseAdmin
    .from("support_conversations")
    .insert({
      user_id: params.userId,
      organization_id: params.organizationId,
      environment: params.environment,
      subject,
      status: "open",
      last_message_preview: params.initialAssistantMessage?.slice(0, 200) ?? null,
      agent_unread_count: 0,
      customer_unread_count: 0,
    })
    .select(CONVERSATION_COLUMNS)
    .single();

  if (error || !conv) throw error || new AppError(500, "api_error", "Nao foi possivel abrir o atendimento.");

  if (params.initialAssistantMessage) {
    await insertMessage({
      conversationId: conv.id,
      senderType: "assistant",
      senderId: null,
      messageType: "assistant_reply",
      content: params.initialAssistantMessage,
      bumpAgentUnread: false,
      bumpCustomerUnread: false,
    });
  }

  return conv;
}

export async function insertMessage(params: {
  conversationId: string;
  senderType: SupportSenderType;
  senderId: string | null;
  messageType?: SupportMessageType;
  content: string;
  metadata?: Record<string, unknown>;
  bumpAgentUnread?: boolean;
  bumpCustomerUnread?: boolean;
}) {
  const content = sanitizeContent(params.content);
  if (!content) throw new AppError(400, "validation_error", "Mensagem vazia.");

  const { data: msg, error } = await supabaseAdmin
    .from("support_messages")
    .insert({
      conversation_id: params.conversationId,
      sender_type: params.senderType,
      sender_id: params.senderId,
      message_type: params.messageType || "text",
      content,
      metadata: params.metadata || {},
    })
    .select(MESSAGE_COLUMNS)
    .single();

  if (error || !msg) throw error || new AppError(500, "api_error", "Nao foi possivel enviar a mensagem.");

  const updates: Record<string, unknown> = {
    last_message_at: msg.created_at,
    last_message_preview: content.slice(0, 200),
    updated_at: new Date().toISOString(),
  };

  if (params.bumpAgentUnread !== false && (params.senderType === "customer" || params.senderType === "assistant")) {
    // increment agent unread for customer messages; assistant is internal UI
  }
  if (params.senderType === "customer") {
    const { data: current } = await supabaseAdmin
      .from("support_conversations")
      .select("agent_unread_count")
      .eq("id", params.conversationId)
      .maybeSingle();
    updates.agent_unread_count = (current?.agent_unread_count ?? 0) + 1;
  }
  if (params.senderType === "agent" || params.senderType === "system") {
    const { data: current } = await supabaseAdmin
      .from("support_conversations")
      .select("customer_unread_count")
      .eq("id", params.conversationId)
      .maybeSingle();
    updates.customer_unread_count = (current?.customer_unread_count ?? 0) + 1;
  }

  await supabaseAdmin.from("support_conversations").update(updates).eq("id", params.conversationId);

  return msg;
}

export async function getConversationForCustomer(
  conversationId: string,
  userId: string,
  organizationId: string
) {
  const { data } = await supabaseAdmin
    .from("support_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", conversationId)
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!data) throw new AppError(404, "not_found", "Atendimento nao encontrado.");
  return data;
}

export async function listMessages(conversationId: string, limit = 100) {
  const { data, error } = await supabaseAdmin
    .from("support_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(Math.min(limit, 200));

  if (error) throw error;
  return data || [];
}

export async function listCustomerConversations(
  userId: string,
  organizationId: string,
  environment: "test" | "live"
) {
  const { data, error } = await supabaseAdmin
    .from("support_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .order("last_message_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
}

/** Resumo seguro de transacoes — SOMENTE da organizacao autenticada. */
export async function getTransactionSummary(
  organizationId: string,
  environment: "test" | "live",
  limit = 10
) {
  const { data: payments, error } = await supabaseAdmin
    .from("payments")
    .select("id, amount, currency, status, description, created_at, paid_at")
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 50));

  if (error) throw error;

  const list = payments || [];
  const approved = list.filter((p) => p.status === "succeeded" || p.status === "paid");
  const pending = list.filter((p) => p.status === "pending" || p.status === "processing");
  const refused = list.filter(
    (p) => p.status === "failed" || p.status === "canceled" || p.status === "expired"
  );

  const sum = (rows: typeof list) => rows.reduce((acc, r) => acc + (r.amount || 0), 0);

  return {
    total: list.length,
    approved_count: approved.length,
    pending_count: pending.length,
    refused_count: refused.length,
    approved_amount: sum(approved),
    pending_amount: sum(pending),
    refused_amount: sum(refused),
    recent: list.map((p) => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency || "BRL",
      status: p.status,
      description: p.description,
      created_at: p.created_at,
      paid_at: p.paid_at,
    })),
  };
}

/** Verifica liberacao de saldo com dados reais — sem inventar prazos. */
export async function getBalanceReleaseInfo(
  organizationId: string,
  environment: "test" | "live"
) {
  const summary = await getTransactionSummary(organizationId, environment, 20);

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id, name, status")
    .eq("id", organizationId)
    .maybeSingle();

  // Saldo via ledger se existir
  let available: number | null = null;
  let pending: number | null = null;

  try {
    const { data: ledger } = await supabaseAdmin
      .from("balance_transactions")
      .select("amount, type, available_on, created_at")
      .eq("organization_id", organizationId)
      .eq("environment", environment)
      .order("created_at", { ascending: false })
      .limit(100);

    if (ledger && ledger.length > 0) {
      const now = Date.now();
      available = 0;
      pending = 0;
      for (const row of ledger) {
        const amt = row.amount || 0;
        if (row.available_on && new Date(row.available_on).getTime() > now) {
          pending += amt;
        } else {
          available += amt;
        }
      }
    }
  } catch {
    // tabela/colunas podem variar — nao inventar valores
  }

  return {
    organization: org ? { id: org.id, name: org.name, status: org.status } : null,
    transactions: summary,
    balance: {
      available_cents: available,
      pending_cents: pending,
    },
    note:
      "Os valores acima refletem apenas dados registrados na sua conta neste ambiente. Prazos de liberacao seguem as regras configuradas na plataforma.",
  };
}

export async function setConversationStatus(
  conversationId: string,
  status: SupportStatus,
  assignedAdminId?: string | null
) {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "resolved") {
    updates.resolved_at = new Date().toISOString();
  } else {
    updates.resolved_at = null;
  }
  if (assignedAdminId !== undefined) {
    updates.assigned_admin_id = assignedAdminId;
  }

  const { data, error } = await supabaseAdmin
    .from("support_conversations")
    .update(updates)
    .eq("id", conversationId)
    .select(CONVERSATION_COLUMNS)
    .single();

  if (error || !data) throw error || new AppError(404, "not_found", "Atendimento nao encontrado.");
  return data;
}

export async function attachPaymentContext(
  conversationId: string,
  paymentId: string,
  organizationId: string,
  environment: "test" | "live"
) {
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id, amount, currency, status, description, created_at")
    .eq("id", paymentId)
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .maybeSingle();

  if (!payment) throw new AppError(404, "not_found", "Transacao nao encontrada nesta conta.");

  const { data, error } = await supabaseAdmin
    .from("support_conversation_context")
    .insert({
      conversation_id: conversationId,
      payment_id: payment.id,
      metadata: {
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        description: payment.description,
        created_at: payment.created_at,
      },
    })
    .select()
    .single();

  if (error) throw error;
  return { context: data, payment };
}

// ---------- Admin ----------

export async function adminListConversations(params: {
  environment: "test" | "live";
  status?: SupportStatus | "all";
  search?: string;
  limit?: number;
  offset?: number;
}) {
  let query = supabaseAdmin
    .from("support_conversations")
    .select(CONVERSATION_COLUMNS, { count: "exact" })
    .eq("environment", params.environment)
    .order("last_message_at", { ascending: false })
    .range(params.offset || 0, (params.offset || 0) + (params.limit || 40) - 1);

  if (params.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  let rows = data || [];

  // Enriquecer com dados do usuario (nome/email) — so IDs da lista
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const orgIds = [...new Set(rows.map((r) => r.organization_id))];

  const usersMap = new Map<string, { email: string | null; name: string | null }>();
  const orgsMap = new Map<string, { name: string | null }>();

  if (userIds.length) {
    const { data: users } = await supabaseAdmin
      .from("users")
      .select("id, email, full_name, name")
      .in("id", userIds);
    for (const u of users || []) {
      usersMap.set(u.id, {
        email: u.email ?? null,
        name: (u.full_name || u.name || null) as string | null,
      });
    }
  }

  if (orgIds.length) {
    const { data: orgs } = await supabaseAdmin.from("organizations").select("id, name").in("id", orgIds);
    for (const o of orgs || []) {
      orgsMap.set(o.id, { name: o.name });
    }
  }

  let enriched = rows.map((r) => ({
    ...r,
    customer_name: usersMap.get(r.user_id)?.name || null,
    customer_email: usersMap.get(r.user_id)?.email || null,
    organization_name: orgsMap.get(r.organization_id)?.name || null,
  }));

  if (params.search) {
    const q = params.search.toLowerCase();
    enriched = enriched.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        r.user_id.toLowerCase().includes(q) ||
        r.organization_id.toLowerCase().includes(q) ||
        (r.customer_name || "").toLowerCase().includes(q) ||
        (r.customer_email || "").toLowerCase().includes(q) ||
        (r.subject || "").toLowerCase().includes(q)
    );
  }

  return { data: enriched, count: count ?? enriched.length };
}

export async function adminGetConversation(conversationId: string) {
  const { data: conv } = await supabaseAdmin
    .from("support_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", conversationId)
    .maybeSingle();

  if (!conv) throw new AppError(404, "not_found", "Atendimento nao encontrado.");

  const messages = await listMessages(conversationId, 200);

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, email, full_name, name")
    .eq("id", conv.user_id)
    .maybeSingle();

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id, name, status")
    .eq("id", conv.organization_id)
    .maybeSingle();

  const { data: contexts } = await supabaseAdmin
    .from("support_conversation_context")
    .select("id, payment_id, metadata, created_at")
    .eq("conversation_id", conversationId);

  // zerar unread do agente ao abrir
  await supabaseAdmin
    .from("support_conversations")
    .update({ agent_unread_count: 0 })
    .eq("id", conversationId);

  return {
    conversation: conv,
    messages,
    customer: user
      ? {
          id: user.id,
          email: user.email,
          name: user.full_name || user.name || null,
        }
      : { id: conv.user_id, email: null, name: null },
    organization: org,
    contexts: contexts || [],
  };
}

export async function markCustomerMessagesRead(conversationId: string, userId: string) {
  await supabaseAdmin
    .from("support_conversations")
    .update({ customer_unread_count: 0 })
    .eq("id", conversationId)
    .eq("user_id", userId);

  await supabaseAdmin
    .from("support_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .in("sender_type", ["agent", "system"])
    .is("read_at", null);
}
