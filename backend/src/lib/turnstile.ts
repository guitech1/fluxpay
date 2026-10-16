/**
 * Validação server-side do Cloudflare Turnstile.
 * Documentação: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 *
 * - Tokens expiram em 300s e são de uso único.
 * - Nunca confiar só na validação do browser.
 * - Secret key só no servidor (TURNSTILE_SECRET_KEY).
 * - Não registar tokens, segredos ou payloads financeiros.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Hostnames legítimos em produção e previews controlados. */
const ALLOWED_HOSTNAMES = new Set([
  "usefluxpay.com",
  "www.usefluxpay.com",
  "fluxpay-sohn.netlify.app",
]);

function isAllowedHostname(hostname: string | undefined): boolean {
  if (!hostname) return false;
  if (ALLOWED_HOSTNAMES.has(hostname)) return true;
  // Deploy previews Netlify: <branch>--fluxpay-sohn.netlify.app
  if (/^[a-z0-9-]+--fluxpay-sohn\.netlify\.app$/i.test(hostname)) return true;
  // Subdomínios futuros controlados
  if (/^[a-z0-9-]+\.usefluxpay\.com$/i.test(hostname)) return true;
  return false;
}

export type TurnstileVerifyResult =
  | { ok: true; hostname: string; action?: string }
  | { ok: false; reason: string };

/**
 * Valida o token Turnstile junto à Cloudflare.
 * @param token - valor de cf-turnstile-response / captchaToken
 * @param remoteIp - IP do cliente quando disponível (x-nf-client-connection-ip / x-forwarded-for)
 */
export async function verifyTurnstile(
  token: string | undefined | null,
  remoteIp?: string | null,
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();

  if (!secret) {
    // Fail closed em produção: sem secret configurado, rejeita.
    // Em development sem secret, permite para não bloquear dev local.
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "turnstile_not_configured" };
    }
    return { ok: true, hostname: "localhost" };
  }

  if (!token || typeof token !== "string" || token.length < 10) {
    return { ok: false, reason: "missing_or_invalid_token" };
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return { ok: false, reason: "siteverify_http_error" };
    }

    const result = (await response.json()) as {
      success?: boolean;
      hostname?: string;
      action?: string;
      "error-codes"?: string[];
    };

    if (result.success !== true) {
      const codes = result["error-codes"]?.join(",") || "unknown";
      return { ok: false, reason: `siteverify_failed:${codes}` };
    }

    if (!isAllowedHostname(result.hostname)) {
      return { ok: false, reason: "hostname_mismatch" };
    }

    return {
      ok: true,
      hostname: result.hostname!,
      action: result.action,
    };
  } catch {
    return { ok: false, reason: "network_or_timeout" };
  }
}

/** Extrai IP do cliente a partir dos headers Netlify / proxy. */
export function clientIpFromRequest(req: {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}): string | undefined {
  const nf = req.headers["x-nf-client-connection-ip"];
  if (typeof nf === "string" && nf) return nf;
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(",")[0].trim();
  }
  return req.ip;
}
