import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { getCurrentEnvironment } from "./dashboard-context";

export type PlatformAdminRole = "superadmin" | "admin" | "support";

export interface PlatformAdminContext {
  userId: string;
  email: string | null;
  role: PlatformAdminRole;
  environment: "test" | "live";
}

/**
 * Porteiro do /admin, no SERVIDOR.
 *
 * Trocar a URL no navegador nao leva ninguem a lugar nenhum: a pagina so
 * renderiza depois desta checagem, e mesmo que alguem burlasse o frontend,
 * todas as rotas /admin-api/* refazem a verificacao no backend contra a
 * tabela platform_admins (que o navegador nao consegue escrever — migration 011).
 *
 * A consulta abaixo funciona com a sessao do proprio usuario porque a RLS
 * permite que cada um enxergue apenas a propria linha de platform_admins.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: admin } = await supabase
    .from("platform_admins")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  // Quem nao e da equipe vai para o painel comum: o ADM nao se anuncia.
  if (!admin) redirect("/dashboard");

  return {
    userId: user.id,
    email: user.email ?? null,
    role: admin.role as PlatformAdminRole,
    environment: await getCurrentEnvironment(),
  };
}

export function canAct(role: PlatformAdminRole): boolean {
  return role === "superadmin" || role === "admin";
}

/** Alias explícito usado pelas páginas /admin/users e /admin/payments. */
export function isAdminRole(role: PlatformAdminRole): boolean {
  return role === "superadmin" || role === "admin";
}

export function isSuperAdmin(role: PlatformAdminRole): boolean {
  return role === "superadmin";
}
