import { config } from "dotenv";
import { z } from "zod";

config();

/**
 * Hosts que so fazem sentido na maquina de quem desenvolve. Em producao, uma
 * URL assim quase sempre significa "esqueci de configurar a variavel".
 */
const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i;

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  API_BASE_URL: z.string().url().default(process.env.DEPLOY_PRIME_URL || process.env.URL || "http://localhost:3001"),
  FRONTEND_URL: z.string().url().default(process.env.DEPLOY_PRIME_URL || process.env.URL || "http://localhost:3000"),
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
// ============================================================
const envSchema = baseEnvSchema.superRefine((value: BaseEnv, ctx: z.RefinementCtx) => {
  if (value.NODE_ENV !== "production") return;

  for (const key of ["API_BASE_URL", "FRONTEND_URL"] as const) {
    if (LOCAL_HOST.test(value[key])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message:
          `${key} aponta para localhost em producao. Defina a URL publica (ex.: https://usefluxpay.com).`,
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

export const env = parsed.data;
