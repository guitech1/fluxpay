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

function resolveApiBase(): string {
  const configured = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  if (typeof window !== "undefined") {
    if (!configured || configured === window.location.origin) return "";
  }
  return configured;
}

/**
 * Chama uma rota do backend em /dashboard-api/*.
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
  const apiUrl = resolveApiBase();

  if (!orgId) {
    throw new Error("Organizacao nao selecionada. Recarregue a pagina ou escolha a empresa.");
  }

  const url = `${apiUrl}/dashboard-api${path.startsWith("/") ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        "X-Organization-Id": orgId,
        "X-Environment": environment,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error(
      `Falha de rede ao chamar ${url}. ` +
        (apiUrl
          ? `NEXT_PUBLIC_API_URL=${apiUrl} pode estar errada ou bloqueada por CORS.`
          : "Confirme que /dashboard-api responde no mesmo dominio.")
    );
  }

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
