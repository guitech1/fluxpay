/**
 * Dashboard: Subcontas somente SmokePay.
 * Se a Smoke estiver desligada/sem key, endpoints respondem 503 claros.
 */
import { Router } from "express";
import { z } from "zod";
import { sessionAuth, requireRole } from "../middleware/session-auth.js";
import {
  listLocalSubaccounts,
  createOrLinkSubaccount,
  getSubaccountBalance,
  getSubaccountDetail,
  listSubaccountTransactions,
  resolveShopIdForOrg,
  SMOKE_SUBACCOUNTS_PROVIDER,
} from "../services/smokepay-shops.js";
import { requestSmokeSubaccountWithdrawal } from "../services/smoke-subaccount-withdrawals.js";
import { publicWithdrawalView } from "../services/withdrawals.js";
import { createPayment } from "../services/payments.js";

const router = Router();
router.use(sessionAuth);

router.get("/subaccounts", async (req, res, next) => {
  try {
    const rows = await listLocalSubaccounts(
      req.dashboardAuth!.organizationId,
      req.dashboardAuth!.environment
    );
    res.json({
      data: rows,
      meta: {
        provider: SMOKE_SUBACCOUNTS_PROVIDER,
        note: "Subcontas operam exclusivamente na SmokePay. Demais adquirentes usam carteira principal.",
        smoke_configured: Boolean(process.env.SMOKEPAY_API_KEY),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/subaccounts", requireRole("owner", "admin"), async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(2).max(120),
        external_ref: z.string().min(2).max(80).optional(),
      })
      .parse(req.body);

    const row = await createOrLinkSubaccount({
      organizationId: req.dashboardAuth!.organizationId,
      environment: req.dashboardAuth!.environment,
      name: body.name,
      externalRef: body.external_ref,
    });
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
});

router.get("/subaccounts/:id/balance", async (req, res, next) => {
  try {
    const shopId = await resolveShopIdForOrg(
      req.dashboardAuth!.organizationId,
      req.dashboardAuth!.environment,
      req.params.id
    );
    const data = await getSubaccountBalance(shopId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.get("/subaccounts/:id", async (req, res, next) => {
  try {
    const shopId = await resolveShopIdForOrg(
      req.dashboardAuth!.organizationId,
      req.dashboardAuth!.environment,
      req.params.id
    );
    const data = await getSubaccountDetail(shopId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.get("/subaccounts/:id/transactions", async (req, res, next) => {
  try {
    const shopId = await resolveShopIdForOrg(
      req.dashboardAuth!.organizationId,
      req.dashboardAuth!.environment,
      req.params.id
    );
    const data = await listSubaccountTransactions(shopId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/subaccounts/:id/withdraw",
  requireRole("owner", "admin"),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          amount: z.number().positive(),
          pix_key: z.string().min(3).max(120),
          pix_key_type: z.string().max(30).optional(),
        })
        .parse(req.body);

      const shopId = await resolveShopIdForOrg(
        req.dashboardAuth!.organizationId,
        req.dashboardAuth!.environment,
        req.params.id
      );

      const result = await requestSmokeSubaccountWithdrawal({
        organizationId: req.dashboardAuth!.organizationId,
        environment: req.dashboardAuth!.environment,
        shopId,
        amountReais: body.amount,
        pixKey: body.pix_key,
        pixKeyType: body.pix_key_type,
        requestedBy: req.dashboardAuth!.userId,
      });

      if (result.mode === "pending_approval" && result.withdrawal) {
        res.status(201).json({
          data: {
            mode: "pending_approval",
            message: "Saque da subconta aguardando aprovacao manual do administrador.",
            withdrawal: publicWithdrawalView(result.withdrawal),
          },
        });
        return;
      }

      res.status(201).json({
        data: {
          mode: "executed",
          smoke: result.smoke,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/** PIX cobrado na subconta — força SmokePay (sem failover para Nexus etc.). */
router.post(
  "/subaccounts/:id/charges",
  requireRole("owner", "admin", "developer"),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          amount: z.number().int().min(100),
          description: z.string().max(200).optional(),
          platform_fee_percent: z.number().min(0).max(100).optional(),
        })
        .parse(req.body);

      const shopId = await resolveShopIdForOrg(
        req.dashboardAuth!.organizationId,
        req.dashboardAuth!.environment,
        req.params.id
      );

      const payment = await createPayment(
        req.dashboardAuth!.organizationId,
        req.dashboardAuth!.environment,
        {
          amount: body.amount,
          currency: "BRL",
          description: body.description,
          payment_method: { type: "pix" },
          shop_id: shopId,
          platform_fee_percent: body.platform_fee_percent,
          metadata: {
            created_from: "dashboard_subaccount",
            subaccount_provider: SMOKE_SUBACCOUNTS_PROVIDER,
            shop_id: shopId,
          },
        }
      );

      res.status(201).json({ data: payment });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
