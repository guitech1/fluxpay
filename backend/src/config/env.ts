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
//
// API_BASE_URL e o que vai no campo `webhook_url` de toda cobranca PIX criada
// na NexusPag. Se a variavel faltar na Netlify, o default assume
// http://localhost:3001 — o adquirente tenta avisar uma maquina que nao
// existe, nenhum PIX e confirmado, e o lojista so descobre pelo cliente
// reclamando que pagou. Dinheiro entra e o sistema nao ve.
//
// FRONTEND_URL monta a URL do checkout hospedado devolvida em
// POST /v1/checkout/sessions: com o default, o link enviado ao pagador aponta
// para o localhost de quem integrou.
//
// Falhar na subida segue o mesmo criterio ja adotado no webhook de entrada
// (503 sem NEXUSPAG_WEBHOOK_SECRET): quando a configuracao errada custa
// dinheiro, e melhor nao subir do que subir quebrado em silencio.
// ============================================================
const envSchema = baseEnvSchema.superRefine((value: BaseEnv, ctx: z.RefinementCtx) => {
  if (value.NODE_ENV !== "production") return;

  for (const key of ["API_BASE_URL", "FRONTEND_URL"] as const) {
    if (LOCAL_HOST.test(value[key])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message:
          `${key} aponta para localhost em producao. ` +
          "Defina a URL publica do site (ver .env.example e a secao 4 do DEPLOY.md).",
      });
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
