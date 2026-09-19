import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { apiLogger } from "./middleware/api-log.js";
import { maintenanceGuard } from "./middleware/maintenance.js";

import paymentsRouter from "./routes/payments.js";
import customersRouter from "./routes/customers.js";
import checkoutRouter from "./routes/checkout.js";
import balanceRouter from "./routes/balance.js";
import webhooksRouter from "./routes/webhooks.js";
import dashboardRouter from "./routes/dashboard.js";
import adminRouter from "./routes/admin.js";
import withdrawalsDashboardRouter from "./routes/withdrawals-dashboard.js";
import withdrawalsAdminRouter from "./routes/withdrawals-admin.js";
import adminBalanceReleaseRouter from "./routes/admin-balance-release.js";

const app = express();

app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin: [env.FRONTEND_URL, "http://localhost:3000"],
    credentials: true,
  })
);

const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/health" || req.path.startsWith("/v1/webhooks/nexuspag"),
  keyGenerator: (req) => {
    const netlifyIp = req.headers["x-nf-client-connection-ip"];
    if (typeof netlifyIp === "string" && netlifyIp) return netlifyIp;
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
    return req.ip ?? "unknown";
  },
  message: {
    error: {
      type: "rate_limit_error",
      message: "Muitas requisicoes em pouco tempo. Aguarde alguns segundos e tente novamente.",
    },
  },
});
app.use(limiter);

app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf.toString("utf8");
    },
  })
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "fluxpay-api", version: "0.1.0" });
});

app.use(maintenanceGuard);

app.use("/v1", apiLogger);

app.use("/v1/payments", paymentsRouter);
app.use("/v1/customers", customersRouter);
app.use("/v1/checkout", checkoutRouter);
app.use("/v1/balance", balanceRouter);
app.use("/v1/webhooks", webhooksRouter);

app.use("/dashboard-api", dashboardRouter);
app.use("/dashboard-api/withdrawals", withdrawalsDashboardRouter);

app.use("/admin-api", adminRouter);
app.use("/admin-api", adminBalanceReleaseRouter);
app.use("/admin-api/withdrawals", withdrawalsAdminRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
