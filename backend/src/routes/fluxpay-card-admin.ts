import { Router, type Request } from "express";
import { z } from "zod";
import { platformAdminAuth } from "../middleware/admin-auth.js";
import { AppError } from "../middleware/error.js";
import {
  listCardsForAdmin,
  getCardById,
  approveCard,
  rejectCard,
  blockCard,
  unblockCard,
  presentCard,
} from "../services/fluxpay-card.js";

const router = Router();

router.use(platformAdminAuth);

function clientIp(req: {
  headers: Record<string, unknown>;
  ip?: string;
}): string | null {
  const nf = req.headers["x-nf-client-connection-ip"];
  if (typeof nf === "string" && nf) return nf;
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0]?.trim() || null;
  return req.ip || null;
}

function requireApproverRole(req: Request): void {
  const role = req.platformAdmin?.role;
  if (role !== "superadmin" && role !== "admin") {
    throw new AppError(
      403,
      "permission_error",
      "Somente administradores podem gerenciar carteiras."
    );
  }
}

router.get("/", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

    const result = await listCardsForAdmin({ status, limit, offset });
    res.json({
      items: result.items.map((c) => ({
        ...presentCard(c),
        email: c.email ?? null,
        organization_name: c.organization_name ?? null,
      })),
      total: result.total,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const card = await getCardById(String(req.params.id));
    if (!card) throw new AppError(404, "not_found", "Carteira nao encontrada.");
    res.json({ card: presentCard(card) });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/approve", async (req, res, next) => {
  try {
    requireApproverRole(req);
    const updated = await approveCard({
      cardId: String(req.params.id),
      adminUserId: req.platformAdmin!.userId,
      ipAddress: clientIp(req),
    });
    res.json({ card: presentCard(updated) });
  } catch (err) {
    next(err);
  }
});

const rejectSchema = z.object({
  reason: z.string().max(500).optional().nullable(),
});

router.post("/:id/reject", async (req, res, next) => {
  try {
    requireApproverRole(req);
    const parsed = rejectSchema.safeParse(req.body || {});
    const updated = await rejectCard({
      cardId: String(req.params.id),
      adminUserId: req.platformAdmin!.userId,
      reason: parsed.success ? parsed.data.reason : null,
      ipAddress: clientIp(req),
    });
    res.json({ card: presentCard(updated) });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/block", async (req, res, next) => {
  try {
    requireApproverRole(req);
    const updated = await blockCard({
      cardId: String(req.params.id),
      actorUserId: req.platformAdmin!.userId,
      actorType: "admin",
      reason: typeof req.body?.reason === "string" ? req.body.reason : null,
      ipAddress: clientIp(req),
    });
    res.json({ card: presentCard(updated) });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/unblock", async (req, res, next) => {
  try {
    requireApproverRole(req);
    const updated = await unblockCard({
      cardId: String(req.params.id),
      actorUserId: req.platformAdmin!.userId,
      actorType: "admin",
      ipAddress: clientIp(req),
    });
    res.json({ card: presentCard(updated) });
  } catch (err) {
    next(err);
  }
});

export default router;
