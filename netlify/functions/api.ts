/**
 * Função Netlify → Express (serverless-http).
 *
 * Import TOP-LEVEL de ../../backend/dist/index.js para o esbuild da Netlify
 * rastrear e embutir express/cors/etc. no bundle da função.
 */
import serverless from "serverless-http";
// Caminho relativo ao arquivo da função; o esbuild da Netlify segue e empacota deps.
import app from "../../backend/dist/index.js";

const FUNCTION_PREFIX = "/.netlify/functions/api";

const REQUIRED_BOOT_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
] as const;

const OPTIONAL_PUSH_ENV = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;

function envPresence(): {
  missing_required: string[];
  missing_push: string[];
} {
  const missing_required = REQUIRED_BOOT_ENV.filter((k) => !process.env[k]?.trim());
  const missing_push = OPTIONAL_PUSH_ENV.filter((k) => !process.env[k]?.trim());
  if (
    !process.env.API_BASE_URL?.trim() &&
    !process.env.DEPLOY_PRIME_URL?.trim() &&
    !process.env.URL?.trim()
  ) {
    missing_required.push("API_BASE_URL (or Netlify deploy URL)");
  }
  if (
    !process.env.FRONTEND_URL?.trim() &&
    !process.env.DEPLOY_PRIME_URL?.trim() &&
    !process.env.URL?.trim()
  ) {
    missing_required.push("FRONTEND_URL (or Netlify deploy URL)");
  }
  return { missing_required, missing_push };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedHandler: any = null;

function getHandler() {
  if (cachedHandler) return cachedHandler;
  const presence = envPresence();
  if (presence.missing_required.length > 0) {
    throw new Error(
      `Variaveis de ambiente em falta: ${presence.missing_required.join(", ")}`
    );
  }
  if (!app) {
    throw new Error("backend/dist/index.js sem export default");
  }
  cachedHandler = serverless(app);
  return cachedHandler;
}

export const handler = async (event: Record<string, unknown>, context: unknown) => {
  try {
    const path = event.path;
    if (typeof path === "string" && path.startsWith(FUNCTION_PREFIX)) {
      event.path = path.slice(FUNCTION_PREFIX.length) || "/";
    }
    const h = getHandler();
    return await h(event, context);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const presence = envPresence();
    return {
      statusCode: 503,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: {
          type: "api_boot_error",
          message: "API indisponivel no arranque.",
          detail: message.slice(0, 800),
          missing_env: presence.missing_required,
          push_env_incomplete: presence.missing_push.length > 0,
          hint:
            presence.missing_required.length > 0
              ? "Defina as variaveis em falta no site Netlify (scopes incl. Functions) e faca um novo deploy."
              : "Boot falhou. Confirme build do backend e bundle da função na Netlify.",
        },
      }),
    };
  }
};
