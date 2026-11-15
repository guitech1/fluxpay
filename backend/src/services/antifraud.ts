import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";

export type AntifraudRules = {
  newAccountMaxPixPerHour: { enabled: boolean; max: number; newAccountDays: number };
  confirmDeniedCpf: { enabled: boolean };
};

export const DEFAULT_ANTIFRAUD_RULES: AntifraudRules = {
  newAccountMaxPixPerHour: { enabled: true, max: 10, newAccountDays: 7 },
  confirmDeniedCpf: { enabled: true },
};

function mergeRules(raw: unknown): AntifraudRules {
  const base = { ...DEFAULT_ANTIFRAUD_RULES };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Partial<AntifraudRules>;
  if (o.newAccountMaxPixPerHour) {
    base.newAccountMaxPixPerHour = {
      enabled: Boolean(o.newAccountMaxPixPerHour.enabled),
      max: Math.min(500, Math.max(1, Number(o.newAccountMaxPixPerHour.max) || 10)),
      newAccountDays: Math.min(90, Math.max(1, Number(o.newAccountMaxPixPerHour.newAccountDays) || 7)),
    };
  }
  if (o.confirmDeniedCpf) {
    base.confirmDeniedCpf = { enabled: Boolean(o.confirmDeniedCpf.enabled) };
  }
  return base;
}

export async function getAntifraudRules(organizationId: string): Promise<AntifraudRules> {
  const { data } = await supabaseAdmin
    .from("organizations")
    .select("settings, metadata, created_at")
    .eq("id", organizationId)
    .maybeSingle();

  const settings = (data?.settings ?? data?.metadata ?? {}) as Record<string, unknown>;
  return mergeRules(settings.antifraud ?? settings.antifraud_rules);
}

export async function saveAntifraudRules(
  organizationId: string,
  rules: AntifraudRules
): Promise<AntifraudRules> {
  const merged = mergeRules(rules);

  // Tenta settings; se coluna não existir, metadata.
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("settings, metadata")
    .eq("id", organizationId)
    .maybeSingle();

  const currentSettings = (org?.settings && typeof org.settings === "object" ? org.settings : {}) as Record<
    string,
    unknown
  >;
  const nextSettings = { ...currentSettings, antifraud: merged };

  let { error } = await supabaseAdmin
    .from("organizations")
    .update({ settings: nextSettings })
    .eq("id", organizationId);

  if (error) {
    const currentMeta = (org?.metadata && typeof org.metadata === "object" ? org.metadata : {}) as Record<
      string,
      unknown
    >;
    const nextMeta = { ...currentMeta, antifraud: merged };
    const retry = await supabaseAdmin
      .from("organizations")
      .update({ metadata: nextMeta })
      .eq("id", organizationId);
    if (retry.error) {
      throw new AppError(500, "api_error", "Não foi possível salvar as regras antifraude.");
    }
  }

  return merged;
}

/**
 * Avalia regras antes de criar cobrança.
 * Lança AppError se bloquear.
 */
export async function assertAntifraudAllowsPayment(params: {
  organizationId: string;
  environment: string;
  paymentType: string;
  payerDocument?: string | null;
  confirmDeniedPayer?: boolean;
}): Promise<void> {
  if (params.paymentType !== "pix") return;

  const rules = await getAntifraudRules(params.organizationId);

  // 1) Limite de PIX/hora em conta nova
  if (rules.newAccountMaxPixPerHour.enabled) {
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("created_at")
      .eq("id", params.organizationId)
      .maybeSingle();

    const createdAt = org?.created_at ? new Date(org.created_at).getTime() : 0;
    const ageDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
    if (ageDays <= rules.newAccountMaxPixPerHour.newAccountDays) {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", params.organizationId)
        .eq("environment", params.environment)
        .eq("payment_type", "pix")
        .gte("created_at", since);

      const n = count ?? 0;
      if (n >= rules.newAccountMaxPixPerHour.max) {
        throw new AppError(
          429,
          "rate_limit_error",
          `Limite antifraude: conta nova pode gerar no máximo ${rules.newAccountMaxPixPerHour.max} PIX por hora. Aguarde ou desative a regra em Segurança.`
        );
      }
    }
  }

  // 2) CPF já negado → exige confirmação explícita
  if (rules.confirmDeniedCpf.enabled && params.payerDocument) {
    const doc = params.payerDocument.replace(/\D/g, "");
    if (doc.length >= 11) {
      const { data: denied } = await supabaseAdmin
        .from("payments")
        .select("id")
        .eq("organization_id", params.organizationId)
        .eq("environment", params.environment)
        .in("status", ["failed", "canceled", "cancelled"])
        .or(`payer_document.eq.${doc},metadata->>document.eq.${doc}`)
        .limit(1);

      if (denied && denied.length > 0 && !params.confirmDeniedPayer) {
        throw new AppError(
          409,
          "confirmation_required",
          "Este CPF já teve cobrança negada nesta conta. Envie confirm_denied_payer: true para confirmar e seguir, ou desative a regra em Segurança."
        );
      }
    }
  }
}
