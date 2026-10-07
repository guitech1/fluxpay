import { Router } from "express";
import { z } from "zod";
import { platformAdminAuth } from "../middleware/admin-auth.js";
import {
  listRankingParticipantsAdmin,
  upsertRankingParticipant,
  removeRankingParticipant,
  getRankingBoard,
  getRankingParticipantById,
} from "../services/ranking.js";

const router = Router();
router.use(platformAdminAuth);

router.get("/ranking/participants", async (_req, res, next) => {
  try {
    const list = await listRankingParticipantsAdmin();
    res.json({ data: list });
  } catch (err) {
    next(err);
  }
});

router.get("/ranking/board", async (_req, res, next) => {
  try {
    const board = await getRankingBoard(100);
    res.json({ data: board });
  } catch (err) {
    next(err);
  }
});

router.post("/ranking/participants", async (req, res, next) => {
  try {
    const schema = z.object({
      organization_id: z.string().uuid().optional().nullable(),
      display_name: z.string().min(2).max(80),
      avatar_url: z.string().url().optional().nullable(),
      manual_amount_cents: z.number().int().min(0).optional().nullable(),
      // score_override: somente ADM; usuario comum nao tem rota
      score_override: z.number().int().min(0).max(100).optional().nullable(),
      is_active: z.boolean().optional(),
    });
    const body = schema.parse(req.body);
    const row = await upsertRankingParticipant({
      ...body,
      created_by: req.platformAdmin!.userId,
    });
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
});

router.patch("/ranking/participants/:id", async (req, res, next) => {
  try {
    const schema = z.object({
      organization_id: z.string().uuid().optional().nullable(),
      display_name: z.string().min(2).max(80).optional(),
      avatar_url: z.string().url().optional().nullable(),
      manual_amount_cents: z.number().int().min(0).optional().nullable(),
      score_override: z.number().int().min(0).max(100).optional().nullable(),
      is_active: z.boolean().optional(),
    });
    const body = schema.parse(req.body);

    const existing = await getRankingParticipantById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: { type: "not_found", message: "Participante nao encontrado." } });
      return;
    }

    const row = await upsertRankingParticipant({
      id: req.params.id,
      display_name: body.display_name ?? existing.display_name,
      organization_id:
        body.organization_id !== undefined ? body.organization_id : existing.organization_id,
      avatar_url: body.avatar_url !== undefined ? body.avatar_url : existing.avatar_url,
      manual_amount_cents:
        body.manual_amount_cents !== undefined
          ? body.manual_amount_cents
          : existing.manual_amount_cents,
      score_override:
        body.score_override !== undefined ? body.score_override : existing.score_override,
      is_active: body.is_active !== undefined ? body.is_active : existing.is_active,
    });
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
});

router.delete("/ranking/participants/:id", async (req, res, next) => {
  try {
    const result = await removeRankingParticipant(req.params.id);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
