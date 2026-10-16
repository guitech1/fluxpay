import type { Request, Response, NextFunction } from "express";
import { verifyTurnstile, clientIpFromRequest } from "../lib/turnstile.js";

/**
 * Middleware que exige um token Turnstile válido no body (cf-turnstile-response
 * ou turnstileToken / captchaToken).
 *
 * NÃO aplicar a:
 * - /v1/webhooks/* (servidor-a-servidor, autenticação por assinatura HMAC)
 * - /health
 * - rotas autenticadas por API key ou sessão já estabelecida (opcional)
 *
 * Uso típico: rotas públicas anónimas sujeitas a abuso (ex.: formulários).
 */
export async function requireTurnstile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token =
    (req.body &&
      (req.body["cf-turnstile-response"] ||
        req.body.turnstileToken ||
        req.body.captchaToken)) ||
    (typeof req.headers["cf-turnstile-response"] === "string"
      ? req.headers["cf-turnstile-response"]
      : undefined);

  const ip = clientIpFromRequest(req);
  const result = await verifyTurnstile(
    typeof token === "string" ? token : undefined,
    ip,
  );

  if (!result.ok) {
    res.status(403).json({
      error: {
        type: "turnstile_error",
        message:
          "Verificação de segurança falhou. Atualize a página e tente novamente.",
        code: result.reason,
      },
    });
    return;
  }

  next();
}
