import { supabaseAdmin } from "../config/supabase.js";
import { getAntifraudRules } from "./antifraud.js";

export type RadarDot = {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  payer_name: string | null;
  suspicious: boolean;
  reasons: string[];
};

export async function getAntifraudRadar(organizationId: string, environment: string) {
  const rules = await getAntifraudRules(organizationId);

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ count: pixHour }, { count: pixDay }, { count: failedDay }, { data: org }, { data: recent }] =
    await Promise.all([
      supabaseAdmin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("environment", environment)
        .eq("payment_type", "pix")
        .gte("created_at", hourAgo),
      supabaseAdmin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("environment", environment)
        .eq("payment_type", "pix")
        .gte("created_at", dayAgo),
      supabaseAdmin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("environment", environment)
        .in("status", ["failed", "canceled", "cancelled"])
        .gte("created_at", dayAgo),
      supabaseAdmin.from("organizations").select("created_at").eq("id", organizationId).maybeSingle(),
      supabaseAdmin
        .from("payments")
        .select("id, amount, status, created_at, payer_name, payer_document, metadata")
        .eq("organization_id", organizationId)
        .eq("environment", environment)
        .eq("payment_type", "pix")
        .gte("created_at", dayAgo)
        .order("created_at", { ascending: false })
        .limit(48),
    ]);

  const { data: deniedRows } = await supabaseAdmin
    .from("payments")
    .select("payer_document")
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .in("status", ["failed", "canceled", "cancelled"])
    .gte("created_at", dayAgo)
    .not("payer_document", "is", null)
    .limit(200);

  const deniedSet = new Set(
    (deniedRows || [])
      .map((r) => (r.payer_document || "").replace(/\D/g, ""))
      .filter((d) => d.length >= 11)
  );

  const createdAt = org?.created_at ? new Date(org.created_at).getTime() : 0;
  const ageDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
  const newAccount =
    rules.newAccountMaxPixPerHour.enabled &&
    ageDays <= rules.newAccountMaxPixPerHour.newAccountDays;

  const pix_last_hour = pixHour ?? 0;
  const pix_last_24h = pixDay ?? 0;
  const failed_last_24h = failedDay ?? 0;
  const denied_documents_24h = deniedSet.size;

  let risk: "low" | "medium" | "high" = "low";
  if (
    (newAccount && pix_last_hour >= rules.newAccountMaxPixPerHour.max * 0.8) ||
    failed_last_24h >= 8 ||
    denied_documents_24h >= 5
  ) {
    risk = "high";
  } else if (
    (newAccount && pix_last_hour >= Math.ceil(rules.newAccountMaxPixPerHour.max * 0.5)) ||
    failed_last_24h >= 3 ||
    denied_documents_24h >= 2
  ) {
    risk = "medium";
  }

  const dots: RadarDot[] = (recent || []).map((p) => {
    const reasons: string[] = [];
    const status = String(p.status || "");
    const doc = (p.payer_document || "").replace(/\D/g, "");
    const amount = Number(p.amount) || 0;

    if (["failed", "canceled", "cancelled"].includes(status)) {
      reasons.push("Cobrança falhou ou foi cancelada");
    }
    if (doc && deniedSet.has(doc)) {
      reasons.push("CPF/CNPJ já associado a falhas nas últimas 24h");
    }
    if (newAccount && amount >= 50000) {
      reasons.push("Conta nova com valor alto (≥ R$ 500)");
    }
    if (newAccount && pix_last_hour >= rules.newAccountMaxPixPerHour.max * 0.7) {
      reasons.push("Conta nova perto do limite de PIX/hora");
    }
    const meta = (p.metadata || {}) as Record<string, unknown>;
    if (meta.antifraud_blocked || meta.risk_flag) {
      reasons.push("Marcada pelo motor antifraude");
    }

    return {
      id: p.id as string,
      amount,
      status,
      created_at: p.created_at as string,
      payer_name: (p.payer_name as string) || null,
      suspicious: reasons.length > 0,
      reasons,
    };
  });

  return {
    risk,
    pix_last_hour,
    pix_last_24h,
    failed_last_24h,
    denied_documents_24h,
    new_account: newAccount,
    rules: {
      max_per_hour_enabled: rules.newAccountMaxPixPerHour.enabled,
      max_per_hour: rules.newAccountMaxPixPerHour.max,
      confirm_denied_enabled: rules.confirmDeniedCpf.enabled,
    },
    dots,
  };
}
