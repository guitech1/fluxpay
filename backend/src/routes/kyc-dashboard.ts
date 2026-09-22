import { Router } from "express";
import { z } from "zod";
import { sessionAuth, requireRole } from "../middleware/session-auth.js";
import {
  getOrganizationKyc,
  getLatestVerification,
  startKycVerification,
  refreshKycFromProvider,
} from "../services/kyc.js";

const router = Router();

router.use(sessionAuth);

router.get("/status", requireRole("owner", "admin", "developer", "viewer"), async (req, res, next) => {
  try {
    const orgId = req.dashboardAuth!.organizationId;
    // Tenta atualizar pendente com o provider (nao bloqueia se falhar)
    const refreshed = await refreshKycFromProvider(orgId);
    res.json({
      data: {
        organization: refreshed.organization,
        verification: refreshed.verification,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/start", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const body = z
      .object({
        document: z.string().min(11).max(20),
        document_type: z.enum(["CPF", "CNPJ"]),
      })
      .parse(req.body);

    const result = await startKycVerification({
      organizationId: req.dashboardAuth!.organizationId,
      userId: req.dashboardAuth!.userId,
      document: body.document,
      documentType: body.document_type,
    });

    res.status(result.reused ? 200 : 201).json({
      data: {
        organization: result.organization,
        verification: result.verification,
        reused: result.reused,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
