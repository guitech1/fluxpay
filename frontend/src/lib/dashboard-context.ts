import { cookies } from "next/headers";

/** Organizacao selecionada (definida pelo middleware ou pela tela de onboarding). */
export async function getCurrentOrgId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("fluxpay_org_id")?.value ?? null;
}

/**
 * Ambiente do painel. Sempre "live": o seletor de teste foi removido e o
 * backend ignora X-Environment=test em producao. Cookie legado e ignorado.
 */
export async function getCurrentEnvironment(): Promise<"test" | "live"> {
  return "live";
}
