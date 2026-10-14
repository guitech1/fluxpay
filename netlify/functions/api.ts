/**
 * Empacota o Express. Import dinamico para capturar falha de boot (env, etc.)
 * e devolver JSON legivel em vez de 502 opaco Runtime.ExitError.
 */
const FUNCTION_PREFIX = "/.netlify/functions/api";

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
    const missingEnv = [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_ANON_KEY",
      "API_BASE_URL",
      "FRONTEND_URL",
    ].filter((k) => !process.env[k]);
    return {
      statusCode: 503,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: {
          type: "api_boot_error",
          message: "API indisponivel no arranque.",
          detail: message.slice(0, 500),
          missing_env: missingEnv,
        },
      }),
    };
  }
};
