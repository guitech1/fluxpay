import { Router } from "express";
import { z } from "zod";
import { sessionAuth } from "../middleware/session-auth.js";
import { AppError } from "../middleware/error.js";
import {
  createConversation,
  insertMessage,
  getConversationForCustomer,
  listMessages,
  listCustomerConversations,
  getTransactionSummary,
  getBalanceReleaseInfo,
  attachPaymentContext,
  markCustomerMessagesRead,
  setConversationStatus,
} from "../services/support.js";

const router = Router();
router.use(sessionAuth);

const WELCOME =
  "Ola! Sou o assistente da FluxPay. Como podemos ajudar?";

/** Lista conversas do usuario autenticado na organizacao atual. */
router.get("/conversations", async (req, res, next) => {
  try {
    const auth = req.dashboardAuth!;
    const data = await listCustomerConversations(auth.userId, auth.organizationId, auth.environment);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

/** Abre nova conversa com mensagem inicial do assistente. */
router.post("/conversations", async (req, res, next) => {
  try {
    const schema = z.object({
      subject: z.string().max(200).optional(),
    });
    const body = schema.parse(req.body || {});
    const auth = req.dashboardAuth!;

    const conv = await createConversation({
      userId: auth.userId,
      organizationId: auth.organizationId,
      environment: auth.environment,
      subject: body.subject || "Atendimento",
      initialAssistantMessage: WELCOME,
    });

    const messages = await listMessages(conv.id);
    res.status(201).json({ data: { conversation: conv, messages } });
  } catch (err) {
    next(err);
  }
});

/** Historico de uma conversa — so se pertencer ao usuario + org. */
router.get("/conversations/:id", async (req, res, next) => {
  try {
    const auth = req.dashboardAuth!;
    const conv = await getConversationForCustomer(req.params.id, auth.userId, auth.organizationId);
    const messages = await listMessages(conv.id);
    await markCustomerMessagesRead(conv.id, auth.userId);
    res.json({ data: { conversation: conv, messages } });
  } catch (err) {
    next(err);
  }
});

/** Cliente envia mensagem. */
router.post("/conversations/:id/messages", async (req, res, next) => {
  try {
    const schema = z.object({
      content: z.string().min(1).max(8000),
    });
    const body = schema.parse(req.body);
    const auth = req.dashboardAuth!;

    const conv = await getConversationForCustomer(req.params.id, auth.userId, auth.organizationId);
    if (conv.status === "resolved") {
      throw new AppError(
        400,
        "invalid_request",
        "Este atendimento foi encerrado. Abra uma nova conversa se precisar de ajuda."
      );
    }

    const msg = await insertMessage({
      conversationId: conv.id,
      senderType: "customer",
      senderId: auth.userId,
      messageType: "text",
      content: body.content,
    });

    res.status(201).json({ data: msg });
  } catch (err) {
    next(err);
  }
});

/**
 * Acoes do assistente automatico — funcoes controladas no backend.
 * Nunca executa SQL arbitrario.
 */
router.post("/conversations/:id/actions", async (req, res, next) => {
  try {
    const schema = z.object({
      action: z.enum([
        "get_recent_transactions",
        "get_balance_release",
        "request_human",
        "request_api_help",
        "select_option",
      ]),
      option: z.string().max(100).optional(),
      payment_id: z.string().uuid().optional(),
    });
    const body = schema.parse(req.body);
    const auth = req.dashboardAuth!;

    const conv = await getConversationForCustomer(req.params.id, auth.userId, auth.organizationId);

    if (body.action === "get_recent_transactions") {
      const summary = await getTransactionSummary(auth.organizationId, auth.environment, 15);

      const formatBRL = (cents: number) =>
        (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

      const lines = [
        "Consultei suas transacoes recentes nesta conta:",
        "",
        `Total listado: ${summary.total}`,
        `Aprovadas: ${summary.approved_count} (${formatBRL(summary.approved_amount)})`,
        `Pendentes: ${summary.pending_count} (${formatBRL(summary.pending_amount)})`,
        `Recusadas/canceladas: ${summary.refused_count} (${formatBRL(summary.refused_amount)})`,
      ];

      if (summary.recent.length) {
        lines.push("", "Ultimas movimentacoes:");
        for (const t of summary.recent.slice(0, 8)) {
          const date = t.created_at
            ? new Date(t.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
            : "—";
          lines.push(
            `• ${t.id.slice(0, 8)}… — ${formatBRL(t.amount)} — ${t.status} — ${date}`
          );
        }
      } else {
        lines.push("", "Nenhuma transacao encontrada neste ambiente.");
      }

      lines.push("", "Para ver o historico completo, use o botao abaixo ou acesse Pagamentos no menu.");

      const reply = await insertMessage({
        conversationId: conv.id,
        senderType: "assistant",
        senderId: null,
        messageType: "assistant_reply",
        content: lines.join("\n"),
        metadata: { action: body.action, summary },
      });

      await insertMessage({
        conversationId: conv.id,
        senderType: "system",
        senderId: null,
        messageType: "system_event",
        content: "link:transactions",
        metadata: { type: "cta", href: "/dashboard/payments", label: "Ver todas as transacoes" },
      });

      if (body.option) {
        await supabaseAdminSubject(conv.id, body.option);
      }

      res.json({ data: { reply, summary } });
      return;
    }

    if (body.action === "get_balance_release") {
      const info = await getBalanceReleaseInfo(auth.organizationId, auth.environment);
      const formatBRL = (cents: number | null) =>
        cents == null
          ? "indisponivel no momento"
          : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

      const lines = [
        "Verifiquei o status das suas vendas e do saldo nesta conta:",
        "",
        `Transacoes aprovadas (amostra): ${info.transactions.approved_count}`,
        `Transacoes pendentes (amostra): ${info.transactions.pending_count}`,
        `Saldo disponivel: ${formatBRL(info.balance.available_cents)}`,
        `Saldo pendente de liberacao: ${formatBRL(info.balance.pending_cents)}`,
        "",
        info.note,
      ];

      if (info.transactions.pending_count > 0) {
        lines.push(
          "",
          "Ha pagamentos ainda em processamento. Quando o status mudar para aprovado e o prazo de liberacao for cumprido, o valor entra no saldo disponivel para saque."
        );
      }

      const reply = await insertMessage({
        conversationId: conv.id,
        senderType: "assistant",
        senderId: null,
        messageType: "assistant_reply",
        content: lines.join("\n"),
        metadata: { action: body.action, info },
      });

      res.json({ data: { reply, info } });
      return;
    }

    if (body.action === "request_api_help" || body.action === "request_human") {
      const subject =
        body.action === "request_api_help"
          ? "Ajuda com integracao da API"
          : "Falar com um atendente";

      await supabaseAdminSubject(conv.id, subject);

      if (body.action === "request_api_help") {
        await insertMessage({
          conversationId: conv.id,
          senderType: "assistant",
          senderId: null,
          messageType: "assistant_reply",
          content:
            "Entendemos. Vamos encaminhar voce para um especialista da FluxPay para auxiliar com a integracao da API.",
        });
        await insertMessage({
          conversationId: conv.id,
          senderType: "assistant",
          senderId: null,
          messageType: "assistant_reply",
          content: "Aguarde enquanto conectamos voce a um atendente.",
        });
      }

      await setConversationStatus(conv.id, "open");

      const systemMsg = await insertMessage({
        conversationId: conv.id,
        senderType: "system",
        senderId: null,
        messageType: "system_event",
        content:
          "Seu atendimento foi encaminhado para nossa equipe. Um especialista respondera nesta conversa assim que estiver disponivel.",
      });

      // Marca como aberto com unread para o ADM
      const { supabaseAdmin } = await import("../config/supabase.js");
      await supabaseAdmin
        .from("support_conversations")
        .update({
          agent_unread_count: 1,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conv.id);

      res.json({ data: { message: systemMsg, human: true } });
      return;
    }

    if (body.action === "select_option" && body.option) {
      await insertMessage({
        conversationId: conv.id,
        senderType: "customer",
        senderId: auth.userId,
        messageType: "option_select",
        content: body.option,
      });
      await supabaseAdminSubject(conv.id, body.option);
      res.json({ data: { ok: true } });
      return;
    }

    if (body.payment_id) {
      const attached = await attachPaymentContext(
        conv.id,
        body.payment_id,
        auth.organizationId,
        auth.environment
      );
      res.json({ data: attached });
      return;
    }

    throw new AppError(400, "validation_error", "Acao invalida.");
  } catch (err) {
    next(err);
  }
});

async function supabaseAdminSubject(conversationId: string, subject: string) {
  const { supabaseAdmin } = await import("../config/supabase.js");
  await supabaseAdmin
    .from("support_conversations")
    .update({ subject: subject.slice(0, 200), updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

export default router;
