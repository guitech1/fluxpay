import { config } from "dotenv";
import { z } from "zod";

config();

/**
 * Hosts que so fazem sentido na maquina de quem desenvolve. Em producao, uma
 * URL assim quase sempre significa "esqueci de configurar a variavel".
 */
const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i;

/**
 * Netlify injeta URL / DEPLOY_PRIME_URL / DEPLOY_URL no runtime da função.
 * Em preview e producao, usamos isso quando API_BASE_URL / FRONTEND_URL
 * estao vazios ou ainda apontam para localhost (default do schema).
 */
function netlifyPublicUrl(): string | undefined {
  for (const key of ["URL", "DEPLOY_PRIME_URL", "DEPLOY_URL"] as const) {
    const v = process.env[key]?.trim();
    if (v && /^https?:\/\//i.test(v) && !LOCAL_HOST.test(v)) return v.replace(/\/$/, "");
  }
  return undefined;
}

function resolvePublicUrl(
  explicit: string | undefined,
  fallbackLocal: string
): string {
  const raw = (explicit || "").trim();
  if (raw && !LOCAL_HOST.test(raw)) return raw.replace(/\/$/, "");
  const netlify = netlifyPublicUrl();
  if (netlify) return netlify;
  if (raw) return raw;
  return fallbackLocal;
}

// Preenche process.env antes do Zod para o default de localhost nao falhar
// em NODE_ENV=production no Deploy Preview / producao Netlify.
{
  const site = netlifyPublicUrl();
  if (site) {
    if (!process.env.API_BASE_URL?.trim() || LOCAL_HOST.test(process.env.API_BASE_URL)) {
      process.env.API_BASE_URL = site;
    }
    if (!process.env.FRONTEND_URL?.trim() || LOCAL_HOST.test(process.env.FRONTEND_URL)) {
      process.env.FRONTEND_URL = site;
    }
  }
}

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  API_BASE_URL: z.string().url().default("http://localhost:3001"),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  WEBHOOK_RETRY_MAX: z.coerce.number().default(5),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),

  // NexusPag (adquirente PIX) — opcionais: sem eles, ambiente "live" recusa a cobrança.
  NEXUSPAG_API_KEY: z.string().optional(),
  NEXUSPAG_WEBHOOK_SECRET: z.string().optional(),
  NEXUSPAG_BASE_URL: z.string().url().optional(),
});

type BaseEnv = z.infer<typeof baseEnvSchema>;

// ============================================================
// Em producao, os defaults de desenvolvimento sao um perigo silencioso.
// Aceitamos URL publica da Netlify (ja injetada acima).
// ============================================================
const envSchema = baseEnvSchema.superRefine((value: BaseEnv, ctx: z.RefinementCtx) => {
  if (value.NODE_ENV !== "production") return;

  for (const key of ["API_BASE_URL", "FRONTEND_URL"] as const) {
    if (LOCAL_HOST.test(value[key])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message:
          `${key} aponta para localhost em producao. Defina a URL publica (ex.: https://usefluxpay.com) ou confie em URL/DEPLOY_PRIME_URL da Netlify.`,
      });
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const fields = parsed.error.flatten().fieldErrors;
  console.error("❌ Invalid environment variables:", fields);
  const names = Object.keys(fields).join(", ");
  // Em Netlify/Lambda process.exit gera 502 opaco. Throw permite resposta 503 com detalhe.
  if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY) {
    throw new Error(`Variaveis de ambiente invalidas ou em falta: ${names}`);
  }
  process.exit(1);
}

export const env = {
  ...parsed.data,
  API_BASE_URL: resolvePublicUrl(parsed.data.API_BASE_URL, "http://localhost:3001"),
  FRONTEND_URL: resolvePublicUrl(parsed.data.FRONTEND_URL, "http://localhost:3000"),
};
