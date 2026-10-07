import { env } from "../config/env.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";
import type { Environment } from "../types/index.js";
import { createCheckoutSession, payCheckoutSessionWithPix } from "./checkout.js";

const ALLOWED_THEMES = ["default", "dark", "light", "brand"] as const;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export type PaymentLinkTheme = (typeof ALLOWED_THEMES)[number];

function sanitizeTheme(input?: {
  color?: string;
  theme?: string;
  message?: string;
}) {
  const color =
    input?.color && COLOR_RE.test(input.color) ? input.color : undefined;
  const theme = ALLOWED_THEMES.includes(input?.theme as PaymentLinkTheme)
    ? (input!.theme as PaymentLinkTheme)
    : "default";
  // Plain text only — strip angle brackets to avoid HTML injection
  const message = input?.message
    ? input.message.replace(/[<>]/g, "").trim().slice(0, 200) || undefined
    : undefined;
  return { color, theme, message };
}

/**
 * Link de pagamento estilo banco: valor + descricao -> URL publica + QR + copia e cola.
 * Reutiliza checkout_sessions + createPayment (mesmo caminho NexusPag/sandbox).
 * Personalizacao (cor, tema, mensagem) fica em metadata — sem tabela nova.
 */
export async function createPaymentLink(
  organizationId: string,
  environment: Environment,
  input: {
    amount: number;
    description?: string;
    expires_in_minutes?: number;
    color?: string;
    theme?: string;
    message?: string;
  }
) {
  if (!input.amount || input.amount < 100) {
    throw new AppError(400, "validation_error", "O valor minimo e R$ 1,00.");
  }

  const description = (input.description || "Link de pagamento").trim().slice(0, 200);
  const expiresMinutes = input.expires_in_minutes ?? 1440;
  const appearance = sanitizeTheme(input);

  const base = env.FRONTEND_URL.replace(/\/$/, "");
  const session = await createCheckoutSession(organizationId, environment, {
    amount: input.amount,
    currency: "BRL",
    success_url: `${base}/checkout/done?status=success`,
    cancel_url: `${base}/checkout/done?status=cancel`,
    line_items: [{ name: description, amount: input.amount, quantity: 1 }],
    metadata: {
      created_from: "payment_link",
      description,
      appearance_color: appearance.color || null,
      appearance_theme: appearance.theme,
      appearance_message: appearance.message || null,
    },
    expires_in_minutes: expiresMinutes,
  });

  const { payment } = await payCheckoutSessionWithPix(session.id);

  return {
    id: session.id,
    url: session.url as string,
    amount: session.amount as number,
    currency: (session.currency as string) || "BRL",
    description,
    status: session.status as string,
    expires_at: session.expires_at as string | null,
    payment_id: payment.id,
    payment_status: payment.status,
    pix_copy_paste: payment.pix_copy_paste ?? null,
    pix_qr_code_base64: payment.pix_qr_code_base64 ?? null,
    simulated: payment.provider === "sandbox",
    appearance,
  };
}

export async function listPaymentLinks(
  organizationId: string,
  environment: Environment,
  limit = 30
) {
  const { data, error } = await supabaseAdmin
    .from("checkout_sessions")
    .select(
      "id, amount, currency, status, expires_at, created_at, payment_id, line_items, metadata"
    )
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .contains("metadata", { created_from: "payment_link" })
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error) {
    throw new AppError(500, "api_error", "Nao foi possivel listar os links de pagamento.");
  }

  const rows = data || [];
  const paymentIds = rows.map((r) => r.payment_id).filter(Boolean) as string[];
  let paymentMap = new Map<string, { status: string }>();

  if (paymentIds.length > 0) {
    const { data: payments } = await supabaseAdmin
      .from("payments")
      .select("id, status")
      .in("id", paymentIds);
    paymentMap = new Map((payments || []).map((p) => [p.id, { status: p.status }]));
  }

  const base = env.FRONTEND_URL.replace(/\/$/, "");

  return rows.map((row) => {
    const meta = (row.metadata || {}) as Record<string, unknown>;
    const items = (row.line_items || []) as { name?: string }[];
    const description =
      (typeof meta.description === "string" && meta.description) ||
      items[0]?.name ||
      "Link de pagamento";
    const payStatus = row.payment_id ? paymentMap.get(row.payment_id)?.status : null;
    let status = row.status as string;
    if (payStatus === "succeeded") status = "complete";
    else if (
      status === "open" &&
      row.expires_at &&
      new Date(row.expires_at as string) < new Date()
    ) {
      status = "expired";
    }

    return {
      id: row.id,
      url: `${base}/checkout/${row.id}`,
      amount: row.amount,
      currency: row.currency || "BRL",
      description,
      status,
      payment_status: payStatus,
      expires_at: row.expires_at,
      created_at: row.created_at,
      appearance: {
        color: typeof meta.appearance_color === "string" ? meta.appearance_color : null,
        theme: typeof meta.appearance_theme === "string" ? meta.appearance_theme : "default",
        message:
          typeof meta.appearance_message === "string" ? meta.appearance_message : null,
      },
    };
  });
}
