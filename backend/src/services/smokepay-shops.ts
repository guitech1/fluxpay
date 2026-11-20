/**
 * Subcontas EXCLUSIVAS da SmokePay.
 * Nexus / Gotham / Profanus não usam este módulo.
 *
 * Doc: GET/POST /api/shops, saldo, saque, PIX com shop_id.
 */
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../middleware/error.js";
import type { Environment } from "../types/index.js";

const PROVIDER = "smokepay" as const;

function baseUrl(): string {
  return process.env.SMOKEPAY_BASE_URL || "https://smokepay.com.br";
}

function apiKey(): string {
  const k = process.env.SMOKEPAY_API_KEY;
  if (!k) {
    throw new AppError(
      503,
      "provider_unavailable",
      "SmokePay não configurada (SMOKEPAY_API_KEY). Subcontas só funcionam na SmokePay."
    );
  }
  return k;
}

function assertSmokeConfigured(): void {
  if (!process.env.SMOKEPAY_API_KEY) {
    throw new AppError(
      503,
      "provider_unavailable",
      "Subcontas estão disponíveis somente com a SmokePay ligada e com API key."
    );
  }
}

async function smokeFetch(path: string, init?: RequestInit): Promise<any> {
  assertSmokeConfigured();
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "x-api-key": apiKey(),
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error || data.detail)) ||
      `SmokePay HTTP ${res.status}`;
    throw new AppError(res.status >= 500 ? 502 : 400, "provider_error", String(msg));
  }
  return data;
}

export type SmokeSubaccountRow = {
  id: string;
  organization_id: string;
  environment: string;
  name: string;
  external_ref: string;
  provider_shop_id: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

/** Lista subcontas locais da org + tenta enriquecer com saldo na Smoke. */
export async function listLocalSubaccounts(
  organizationId: string,
  environment: Environment
): Promise<SmokeSubaccountRow[]> {
  const { data, error } = await supabaseAdmin
    .from("smoke_subaccounts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as SmokeSubaccountRow[];
}

/**
 * Cria/vincula subconta:
 * 1) grava local
 * 2) tenta POST /api/shops na Smoke (se a API aceitar)
 * 3) senão usa external_ref como shop_id (GET /api/shops/{external_ref})
 */
export async function createOrLinkSubaccount(params: {
  organizationId: string;
  environment: Environment;
  name: string;
  externalRef?: string;
}): Promise<SmokeSubaccountRow> {
  assertSmokeConfigured();
  const external_ref =
    (params.externalRef || "").trim() ||
    `org_${params.organizationId.slice(0, 8)}_${Date.now().toString(36)}`;
  const name = params.name.trim();
  if (!name) throw new AppError(400, "validation_error", "Informe o nome da subconta.");

  let provider_shop_id: string | null = null;
  let remote: unknown = null;

  // Tentativa de criação na Smoke
  try {
    const created = await smokeFetch("/api/shops", {
      method: "POST",
      body: JSON.stringify({ name, external_ref }),
    });
    remote = created;
    provider_shop_id =
      created?.id ||
      created?.shop?.id ||
      created?.data?.id ||
      external_ref;
  } catch {
    // API pode não expor POST — usa external_ref e valida com GET
    try {
      const detail = await smokeFetch(`/api/shops/${encodeURIComponent(external_ref)}`);
      remote = detail;
      provider_shop_id =
        detail?.id || detail?.shop?.id || detail?.data?.id || external_ref;
    } catch {
      provider_shop_id = external_ref;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("smoke_subaccounts")
    .upsert(
      {
        organization_id: params.organizationId,
        environment: params.environment,
        name,
        external_ref,
        provider_shop_id,
        status: "active",
        metadata: remote ? { remote } : {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,environment,external_ref" }
    )
    .select("*")
    .single();

  if (error || !data) throw error || new Error("Falha ao gravar subconta");
  return data as SmokeSubaccountRow;
}

export async function getSubaccountBalance(shopId: string): Promise<unknown> {
  return smokeFetch(`/api/shops/${encodeURIComponent(shopId)}/balance`);
}

export async function getSubaccountDetail(shopId: string): Promise<unknown> {
  return smokeFetch(`/api/shops/${encodeURIComponent(shopId)}`);
}

export async function listSubaccountTransactions(shopId: string): Promise<unknown> {
  return smokeFetch(`/api/shops/${encodeURIComponent(shopId)}/transactions`);
}

/** Saque PIX direto do saldo da subconta na SmokePay. */
export async function withdrawFromSubaccount(params: {
  shopId: string;
  amountReais: number;
  pixKey: string;
  pixKeyType?: string;
}): Promise<unknown> {
  const body: Record<string, unknown> = {
    amount: params.amountReais,
    pix_key: params.pixKey,
  };
  if (params.pixKeyType) body.pix_key_type = params.pixKeyType;
  return smokeFetch(`/api/shops/${encodeURIComponent(params.shopId)}/withdraw`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function resolveShopIdForOrg(
  organizationId: string,
  environment: Environment,
  externalRefOrId: string
): Promise<string> {
  const { data } = await supabaseAdmin
    .from("smoke_subaccounts")
    .select("provider_shop_id, external_ref")
    .eq("organization_id", organizationId)
    .eq("environment", environment)
    .or(`id.eq.${externalRefOrId},external_ref.eq.${externalRefOrId},provider_shop_id.eq.${externalRefOrId}`)
    .maybeSingle();

  if (data?.provider_shop_id) return data.provider_shop_id;
  if (data?.external_ref) return data.external_ref;
  return externalRefOrId;
}

export const SMOKE_SUBACCOUNTS_PROVIDER = PROVIDER;
