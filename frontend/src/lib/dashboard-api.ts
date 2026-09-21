import { createClient } from "./supabase/client";

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const prefix = `${name}=`;
  const row = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  if (!row) return undefined;
  const raw = row.slice(prefix.length);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Chama uma rota do backend em /dashboard-api/*, que exige uma acao com
 * logica de servidor (gerar chave/segredo, chamar o adquirente) — tudo que
 * a RLS sozinha nao pode proteger (ver migration 010 e routes/dashboard.ts).
 *
 * Envia o access_token da sessao atual e a organizacao/ambiente selecionados
 * no painel via headers; o backend confere se o usuario realmente pertence
 * aquela organizacao antes de fazer qualquer coisa.
 */
export async function dashboardFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Sessao expirada. Faca login novamente.");
  }

  const orgId = getCookie("fluxpay_org_id");
  const environment = getCookie("fluxpay_env") || "test";
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

  if (!orgId) {
    throw new Error("Organizacao nao selecionada. Recarregue a pagina ou escolha a empresa.");
  }

  const response = await fetch(`${apiUrl}/dashboard-api${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      "X-Organization-Id": orgId,
      "X-Environment": environment,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      json?.error?.message ||
      (typeof json?.message === "string" ? json.message : null) ||
      `Erro ${response.status} ao chamar ${path}`;
    throw new Error(message);
  }

  return json as T;
}
