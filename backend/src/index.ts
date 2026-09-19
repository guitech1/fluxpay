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

const app = express();

// Atras da Netlify (ou de qualquer proxy), o IP real do cliente chega em
// X-Forwarded-For. Sem isto, req.ip vira o IP do proxy: o rate limit passaria
// a contar TODO o trafego num balde so e os api_logs registrariam sempre o
// mesmo endereco. `1` = confia em um unico proxy a frente (o da Netlify).
app.set("trust proxy", 1);

// Security
app.use(helmet());
app.use(
  cors({
    origin: [env.FRONTEND_URL, "http://localhost:3000"],
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // /health e o webhook de entrada da NexusPag ficam de fora: derrubar o
  // monitoramento ou fazer o adquirente gastar retry por excesso de chamadas
  // seria pior do que o risco que o limite evita.
  skip: (req) => req.path === "/health" || req.path.startsWith("/v1/webhooks/nexuspag"),
  keyGenerator: (req) => {
    // A Netlify manda o IP do cliente em x-nf-client-connection-ip; o
    // fallback cobre qualquer outro host (Render, Railway, local).
    const netlifyIp = req.headers["x-nf-client-connection-ip"];
    if (typeof netlifyIp === "string" && netlifyIp) return netlifyIp;
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
    return req.ip ?? "unknown";
  },
  message: {
    error: {
      type: "rate_limit_error",
      message: "Too many requests. Please try again later.",
    },
  },
});
app.use(limiter);

// Logging
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

// Body parsing — guarda o corpo bruto em req.rawBody, necessario para
// validar a assinatura HMAC do webhook de entrada da NexusPag.
app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf.toString("utf8");
    },
  })
);

// Health
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "fluxpay-api", version: "0.1.0" });
});

// Modo manutencao: bloqueia /v1/* e /dashboard-api/* quando ligado no ADM.
// Fica ANTES de tudo que atende lojista; /admin-api/*, /health e o webhook de
// entrada da NexusPag passam direto (ver middleware/maintenance.ts).
app.use(maintenanceGuard);

// Auditoria: grava cada chamada /v1/* em api_logs
app.use("/v1", apiLogger);

// API v1 — integracoes externas (autenticadas por API key sk_/pk_)
app.use("/v1/payments", paymentsRouter);
app.use("/v1/customers", customersRouter);
app.use("/v1/checkout", checkoutRouter);
app.use("/v1/balance", balanceRouter);
app.use("/v1/webhooks", webhooksRouter);

// API do painel — autenticada por sessao do Supabase Auth (ver middleware/session-auth.ts)
app.use("/dashboard-api", dashboardRouter);

// API do painel administrativo da plataforma — autenticada por sessao E por
// pertencer a platform_admins (ver middleware/admin-auth.ts).
app.use("/admin-api", adminRouter);

// 404 + error
app.use(notFoundHandler);
app.use(errorHandler);

// Nao chama app.listen() aqui: este arquivo e importado tanto pelo
// servidor tradicional (server.ts, para Render/Railway/etc.) quanto pela
// funcao serverless da Netlify (netlify/functions/api.ts). Cada um decide
// como rodar o app.
export default app;
