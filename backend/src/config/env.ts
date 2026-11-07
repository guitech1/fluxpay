import { config } from "dotenv";
import { z } from "zod";

config();

const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i;

const IS_NETLIFY = Boolean(
  process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV
);

/** URL pública injetada pela Netlify (site ou deploy preview). */
function netlifyPublicUrl(): string | undefined {
  for (const key of ["URL", "DEPLOY_PRIME_URL", "DEPLOY_URL", "SITE_URL"] as const) {
    const v = process.env[key]?.trim();
    if (v && /^https?:\/\//i.test(v) && !LOCAL_HOST.test(v)) {
      return v.replace(/\/$/, "");
    }
  }
  return undefined;
}

/**
 * Garante API_BASE_URL e FRONTEND_URL antes do Zod.
 * - string vazia / localhost → URL da Netlify
 * - se Netlify não injetar nada → https://usefluxpay.com (produção conhecida)
 * Assim o superRefine de "localhost em production" não quebra o boot no preview.
 */
function ensurePublicUrls(): void {
  const site = netlifyPublicUrl() || (IS_NETLIFY ? "https://usefluxpay.com" : undefined);
  if (!site) return;

  for (const key of ["API_BASE_URL", "FRONTEND_URL"] as const) {
    const cur = process.env[key];
    if (!cur || !cur.trim() || LOCAL_HOST.test(cur.trim())) {
      process.env[key] = site;
    }
  }
}

ensurePublicUrls();

/** Trata "" como ausente para o .default() do Zod aplicar. */
const urlWithDefault = (fallback: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().url().default(fallback)
  );

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  API_BASE_URL: urlWithDefault("http://localhost:3001"),
  FRONTEND_URL: urlWithDefault("http://localhost:3000"),
  WEBHOOK_RETRY_MAX: z.coerce.number().default(5),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),

  NEXUSPAG_API_KEY: z.string().optional(),
  NEXUSPAG_WEBHOOK_SECRET: z.string().optional(),
  NEXUSPAG_BASE_URL: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().url().optional()
  ),
});

type BaseEnv = z.infer<typeof baseEnvSchema>;

const envSchema = baseEnvSchema.superRefine((value: BaseEnv, ctx: z.RefinementCtx) => {
  if (value.NODE_ENV !== "production") return;
  // Na Netlify já forçamos URL pública acima; não bloqueia o boot.
  if (IS_NETLIFY) return;

  for (const key of ["API_BASE_URL", "FRONTEND_URL"] as const) {
    if (LOCAL_HOST.test(value[key])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} aponta para localhost em producao. Defina a URL publica.`,
      });
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const fields = parsed.error.flatten().fieldErrors;
  console.error("❌ Invalid environment variables:", fields);
  const names = Object.keys(fields).join(", ");
  if (process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY || IS_NETLIFY) {
    throw new Error(`Variaveis de ambiente invalidas ou em falta: ${names}`);
  }
  process.exit(1);
}

export const env = parsed.data;
