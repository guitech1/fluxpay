/**
 * Empacota o Express. Import dinamico para capturar falha de boot (env, etc.)
 * e devolver JSON legivel em vez de 502 opaco Runtime.ExitError.
 *
 * Nota operacional: variaveis definidas no painel Netlify so entram em
 * process.env da funcao apos um NOVO deploy. Sem rebuild, missing_env
 * continua a listar chaves que ja existem no UI.
 */
const FUNCTION_PREFIX = "/.netlify/functions/api";

/** Chaves obrigatorias para o backend subir (alinhado a backend/src/config/env.ts). */
const REQUIRED_BOOT_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
] as const;

/** Chaves opcionais para Web Push (nao bloqueiam boot; sem elas o envio e skip). */
const OPTIONAL_PUSH_ENV = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;

function envPresence(): {
  missing_required: string[];
  missing_push: string[];
} {
  const missing_required = REQUIRED_BOOT_ENV.filter((k) => !process.env[k]?.trim());
  const missing_push = OPTIONAL_PUSH_ENV.filter((k) => !process.env[k]?.trim());
  if (!process.env.API_BASE_URL?.trim() && !process.env.DEPLOY_PRIME_URL?.trim() && !process.env.URL?.trim()) missing_required.push("API_BASE_URL (or Netlify deploy URL)");
  if (!process.env.FRONTEND_URL?.trim() && !process.env.DEPLOY_PRIME_URL?.trim() && !process.env.URL?.trim()) missing_required.push("FRONTEND_URL (or Netlify deploy URL)");
  return { missing_required, missing_push };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedHandler: any = null;
let bootError: string | null = null;

async function getHandler() {
  if (bootError) throw new Error(bootError);
  if (cachedHandler) return cachedHandler;
  try {
    const serverless = (await import("serverless-http")).default;
    const mod = await import("../../backend/dist/index.js");
    const app = mod.default;
    cachedHandler = serverless(app);
    return cachedHandler;
  } catch (err) {
    bootError = err instanceof Error ? err.message : String(err);
    console.error("[api] boot failed:", bootError);
    throw err;
  }
}

export const handler = async (event: Record<string, unknown>, context: unknown) => {
  try {
    const path = event.path;
    if (typeof path === "string" && path.startsWith(FUNCTION_PREFIX)) {
      event.path = path.slice(FUNCTION_PREFIX.length) || "/";
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
          detail: message.slice(0, 500),
          missing_env: presence.missing_required,
          push_env_incomplete: presence.missing_push.length > 0,
          hint:
            presence.missing_required.length > 0
              ? "Defina as variaveis em falta no site Netlify (scopes incl. Functions) e faca um novo deploy. Valores adicionados no UI apos o ultimo deploy nao existem em process.env ate rebuild."
              : "Boot falhou por outro motivo (ver detail). Confirme que o build publicou backend/dist.",
        },
      }),
    };
  }
};
