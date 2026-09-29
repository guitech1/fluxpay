import { Router } from "express";
import { z } from "zod";
import { platformAdminAuth, requireAdminRole, logAdminAction } from "../middleware/admin-auth.js";
import {
  adminListConversations,
  adminGetConversation,
  insertMessage,
  setConversationStatus,
} from "../services/support.js";
import { AppError } from "../middleware/error.js";

const router = Router();
router.use(platformAdminAuth);

/** Lista atendimentos da plataforma (com filtros). */
router.get(
  "/support/conversations",
  requireAdminRole("superadmin", "admin", "support"),
  async (req, res, next) => {
    try {
      const status = (req.query.status as string) || "all";
      const search = (req.query.search as string) || undefined;
      const limit = Math.min(parseInt(String(req.query.limit || "40"), 10) || 40, 100);
      const offset = parseInt(String(req.query.offset || "0"), 10) || 0;

      const result = await adminListConversations({
        environment: req.platformAdmin!.environment,
        status: status as any,
        search,
        limit,
        offset,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

/** Detalhe + historico + contexto do cliente. */
router.get(
  "/support/conversations/:id",
  requireAdminRole("superadmin", "admin", "support"),
  async (req, res, next) => {
    try {
      const data = await adminGetConversation(req.params.id);
      // Ambiente: ADM ve ambos, mas filtramos se quiser consistencia
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

/** Atendente responde. */
router.post(
  "/support/conversations/:id/messages",
  requireAdminRole("superadmin", "admin", "support"),
  async (req, res, next) => {
    try {
      const schema = z.object({ content: z.string().min(1).max(8000) });
      const body = schema.parse(req.body);
      const admin = req.platformAdmin!;

      const detail = await adminGetConversation(req.params.id);
      if (detail.conversation.status === "resolved") {
        throw new AppError(
          400,
          "invalid_request",
          "Reabra o atendimento antes de enviar mensagens."
        );
      }

      // Assumir se ainda aberto sem agente
      if (!detail.conversation.assigned_admin_id) {
        await setConversationStatus(req.params.id, "in_progress", admin.userId);
        await insertMessage({
          conversationId: req.params.id,
          senderType: "system",
          senderId: admin.userId,
          messageType: "system_event",
          content: `Atendimento iniciado por ${admin.email || "atendente"}.`,
        });
      } else if (detail.conversation.status === "open") {
        await setConversationStatus(req.params.id, "in_progress", detail.conversation.assigned_admin_id);
      }

      const msg = await insertMessage({
        conversationId: req.params.id,
        senderType: "agent",
        senderId: admin.userId,
        messageType: "text",
        content: body.content,
      });

      await logAdminAction(req, {
        action: "support.message_sent",
        targetType: "support_conversation",
        targetId: req.params.id,
      });

      res.status(201).json({ data: msg });
    } catch (err) {
      next(err);
    }
  }
);

/** Mudanca de status: assume, encerra, reabre, aguardando cliente. */
router.post(
  "/support/conversations/:id/status",
  requireAdminRole("superadmin", "admin", "support"),
  async (req, res, next) => {
    try {
      const schema = z.object({
        status: z.enum(["open", "in_progress", "waiting_customer", "resolved"]),
        assign_self: z.boolean().optional(),
      });
      const body = schema.parse(req.body);
      const admin = req.platformAdmin!;

      const before = await adminGetConversation(req.params.id);

      let assigned: string | null | undefined = undefined;
      if (body.assign_self || body.status === "in_progress") {
        assigned = admin.userId;
      }

      const conv = await setConversationStatus(req.params.id, body.status, assigned);

      if (body.status === "in_progress" && body.assign_self) {
        await insertMessage({
          conversationId: req.params.id,
          senderType: "system",
          senderId: admin.userId,
          messageType: "system_event",
          content: `Atendimento iniciado por ${admin.email || "atendente"}.`,
        });
      }

      if (body.status === "resolved") {
        await insertMessage({
          conversationId: req.params.id,
          senderType: "system",
          senderId: admin.userId,
          messageType: "system_event",
          content:
            "Este atendimento foi encerrado. Caso precise de mais ajuda, voce pode iniciar uma nova conversa.",
        });
      }

      if (body.status === "waiting_customer") {
        await insertMessage({
          conversationId: req.params.id,
          senderType: "system",
          senderId: admin.userId,
          messageType: "system_event",
          content: "Aguardando resposta do cliente.",
        });
      }

      await logAdminAction(req, {
        action: "support.status_changed",
        targetType: "support_conversation",
        targetId: req.params.id,
        stateBefore: { status: before.conversation.status },
        stateAfter: { status: conv.status },
      });

      res.json({ data: conv });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
