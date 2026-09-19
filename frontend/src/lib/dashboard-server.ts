import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { getCurrentOrgId, getCurrentEnvironment } from "./dashboard-context";
import type { Environment, Organization, OrgRole } from "./types";

export interface DashboardContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email: string | null };
  organization: Organization;
  role: OrgRole;
  environment: Environment;
  isPlatformAdmin: boolean;
}

/**
 * Resolve tudo que toda pagina do painel precisa: sessao, organizacao atual,
 * papel do usuario nela e ambiente selecionado (test/live).
 *
 * Nao existe filtro por organizacao nas queries das paginas porque a RLS ja
 * faz isso pela sessao (migrations 002/009). O organization_id aqui serve
 * para escolher ENTRE as empresas de quem participa de mais de uma, e o
 * environment para separar sandbox de producao — esse sim precisa ir em
 * toda query, porque a RLS nao sabe qual ambiente o painel esta mostrando.
 */
export async function requireDashboardContext(): Promise<DashboardContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  let orgId = await getCurrentOrgId();

  if (!orgId) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    orgId = membership?.organization_id ?? null;
  }

  if (!orgId) redirect("/onboarding");

  // A RLS so devolve a organizacao se o usuario for membro dela — um cookie
  // fluxpay_org_id forjado simplesmente nao encontra nada aqui.
  const { data: organization } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .maybeSingle();

  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organization || !member) redirect("/onboarding");

  // A RLS de platform_admins so deixa cada um ver a propria linha, entao isto
  // aqui responde "eu sou da equipe?" sem expor a lista a ninguem.
  const { data: platformAdmin } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    supabase,
    user: { id: user.id, email: user.email ?? null },
    organization: organization as Organization,
    role: member.role as OrgRole,
    environment: await getCurrentEnvironment(),
    isPlatformAdmin: Boolean(platformAdmin),
  };
}

/** Papeis que podem escrever (criar chave, reembolsar, editar cliente...). */
export function canWrite(role: OrgRole): boolean {
  return role === "owner" || role === "admin" || role === "developer";
}

/** Papeis que administram a empresa (equipe, dados cadastrais). */
export function canAdmin(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}
