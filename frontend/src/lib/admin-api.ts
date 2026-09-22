import { createClient } from "./supabase/client";

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];
}

/**
 * Chama /admin-api/*. Diferente do dashboardFetch, nao manda
 * X-Organization-Id: o ADM opera sobre a plataforma inteira. Manda o ambiente
 * porque teste e producao sao mundos separados tambem aqui.
 *
 * O backend refaz toda a autorizacao (platform_admins). Este helper e
 * conveniencia, nunca controle de acesso.
 */
export async function adminFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) throw new Error("Sessão expirada. Faça login novamente.");

  const environment = getCookie("fluxpay_env") || "test";
  // Em producao fica vazio de proposito (mesmo host do painel via redirects Netlify).
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  const url = `${apiUrl}/admin-api${path.startsWith("/") ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        "X-Environment": environment,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error(
      `Falha de rede ao chamar ${url}. ` +
        (apiUrl
          ? `NEXT_PUBLIC_API_URL=${apiUrl} pode estar errada ou bloqueada por CORS.`
          : "Confirme que /admin-api responde no mesmo dominio do painel.")
    );
  }

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(json?.error?.message || `Erro ${response.status} ao chamar ${path}`);
  }

  return json as T;
}
