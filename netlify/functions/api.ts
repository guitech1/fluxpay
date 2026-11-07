/**
 * Empacota o Express. Carrega o bundle CJS gerado no build
 * (netlify/functions/backend-app.cjs via esbuild).
 *
 * Importante: a Netlify compila esta função para CJS; import.meta.url
 * pode ser undefined — não usar createRequire(import.meta.url) no topo.
 */
import { join } from "path";

const FUNCTION_PREFIX = "/.netlify/functions/api";

/** Chaves obrigatórias para o backend subir (alinhado a backend/src/config/env.ts). */
const REQUIRED_BOOT_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
] as const;

/** Chaves opcionais para Web Push (não bloqueiam boot; sem elas o envio é skip). */
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

/** Resolve require + diretório sem depender de import.meta.url no topo. */
function nodeRequire(): NodeRequire {
  // Quando a Netlify empacota como CJS, require global existe.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (typeof g.require === "function") return g.require as NodeRequire;
  // Fallback ESM (dev local): createRequire só se import.meta.url existir
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createRequire } = require("module") as typeof import("module");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metaUrl = (import.meta as any)?.url as string | undefined;
    if (metaUrl) return createRequire(metaUrl);
  } catch {
    /* ignore */
  }
  throw new Error("require indisponivel neste runtime");
}

function loadApp(): unknown {
  const req = nodeRequire();
  const candidates = [
    "./backend-app.cjs",
    join(__dirname, "backend-app.cjs"),
    "/var/task/netlify/functions/backend-app.cjs",
    "/var/task/backend-app.cjs",
    join(process.cwd(), "netlify/functions/backend-app.cjs"),
    join(process.cwd(), "backend-app.cjs"),
  ];

  const errors: string[] = [];
  for (const p of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = req(p);
      const app = mod?.default ?? mod;
      if (app) return app;
      errors.push(`${p}: sem default/module.exports`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${p}: ${msg.slice(0, 120)}`);
    }
  }
  throw new Error(
    `Nao foi possivel carregar backend-app.cjs. Tentativas: ${errors.join(" | ")}`
  );
}

async function getHandler() {
  if (bootError) throw new Error(bootError);
  if (cachedHandler) return cachedHandler;
  try {
    const presence = envPresence();
    if (presence.missing_required.length > 0) {
      bootError = `Variaveis de ambiente em falta: ${presence.missing_required.join(", ")}`;
      bootDetail = bootError;
      throw new Error(bootError);
    }
    const serverless = (await import("serverless-http")).default;
    const app = loadApp();
    cachedHandler = serverless(app);
    return cachedHandler;
  } catch (err) {
    bootError = err instanceof Error ? err.message : String(err);
    bootDetail = bootError;
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
          detail: (bootDetail || message).slice(0, 800),
          missing_env: presence.missing_required,
          push_env_incomplete: presence.missing_push.length > 0,
          hint:
            presence.missing_required.length > 0
              ? "Defina as variaveis em falta no site Netlify (scopes incl. Functions) e faca um novo deploy. Valores adicionados no UI apos o ultimo deploy nao existem em process.env ate rebuild."
              : "Boot falhou ao carregar backend-app.cjs. Confirme que o build (esbuild no netlify.toml) gerou netlify/functions/backend-app.cjs.",
        },
      }),
    };
  }
};
