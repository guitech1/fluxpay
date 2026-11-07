/**
 * Função Netlify → Express (serverless-http).
 *
 * Import ESTÁTICO de ../../backend/dist/index.js para o esbuild da Netlify
 * rastrear e embutir express/cors/etc. no bundle da função.
 * (Import dinâmico + included_files/node_modules falhou várias vezes no Free.)
 *
 * Falha de boot (env inválida, etc.) é capturada e devolve JSON 503 legível.
 */
import type { Handler } from "@netlify/functions";

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
let bootError: string | null = null;
let bootDetail: string | null = null;
let bootAttempted = false;

async function getHandler() {
  if (bootError) throw new Error(bootError);
  if (cachedHandler) return cachedHandler;
  if (bootAttempted && !cachedHandler) throw new Error(bootError || "boot failed");
  bootAttempted = true;

  try {
    const presence = envPresence();
    if (presence.missing_required.length > 0) {
      bootError = `Variaveis de ambiente em falta: ${presence.missing_required.join(", ")}`;
      bootDetail = bootError;
      throw new Error(bootError);
    }

    // Imports estáticos resolvidos pelo esbuild da Netlify (express entra no bundle).
    const [{ default: serverless }, { default: app }] = await Promise.all([
      import("serverless-http"),
      import("../../backend/dist/index.js"),
    ]);

    if (!app) {
      throw new Error("backend/dist/index.js sem export default");
    }

    cachedHandler = serverless(app);
    return cachedHandler;
  } catch (err) {
    bootError = err instanceof Error ? err.message : String(err);
    bootDetail = bootError;
    console.error("[api] boot failed:", bootError);
    throw err;
  }
}

export const handler: Handler = async (event, context) => {
  try {
    const path = event.path;
    if (typeof path === "string" && path.startsWith(FUNCTION_PREFIX)) {
      (event as { path: string }).path = path.slice(FUNCTION_PREFIX.length) || "/";
    }
    const h = await getHandler();
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
          detail: (bootDetail || message).slice(0, 800),
          missing_env: presence.missing_required,
          push_env_incomplete: presence.missing_push.length > 0,
          hint:
            presence.missing_required.length > 0
              ? "Defina as variaveis em falta no site Netlify (scopes incl. Functions) e faca um novo deploy."
              : "Boot falhou ao importar backend/dist. Confirme build do backend e que o esbuild da função resolve express.",
        },
      }),
    };
  }
};
