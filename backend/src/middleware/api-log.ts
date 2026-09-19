import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "../config/supabase.js";

/**
 * Grava cada chamada em /v1/* na tabela api_logs (auditoria).
 * A tabela ja existia no schema desde a migration 001, mas nenhuma rota
 * gravava nela — a pagina "Logs da API" do painel nao tinha o que mostrar.
 *
 * Roda depois da resposta ser enviada (evento 'finish'), sem atrasar o
 * request, e nunca deixa uma falha de log derrubar a API.
 */
export function apiLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const requestId = randomUUID();
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const durationMs = Date.now() - start;

    supabaseAdmin
      .from("api_logs")
      .insert({
        organization_id: req.auth?.organizationId ?? null,
        api_key_id: req.auth?.apiKeyId ?? null,
        environment: req.auth?.environment ?? null,
        method: req.method,
        path: req.originalUrl.split("?")[0],
        status_code: res.statusCode,
        request_id: requestId,
        ip_address: req.ip,
        user_agent: req.headers["user-agent"] ?? null,
        duration_ms: durationMs,
      })
      .then(({ error }) => {
        if (error) console.error("Falha ao gravar api_logs:", error.message);
      });
  });

  next();
}
