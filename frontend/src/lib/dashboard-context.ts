import { cookies } from "next/headers";

/** Organizacao selecionada (definida pelo middleware ou pela tela de onboarding). */
export async function getCurrentOrgId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("fluxpay_org_id")?.value ?? null;
}

/** Ambiente selecionado no painel — "test" por padrao, alternavel pelo usuario. */
export async function getCurrentEnvironment(): Promise<"test" | "live"> {
  const cookieStore = await cookies();
  const value = cookieStore.get("fluxpay_env")?.value;
  return value === "live" ? "live" : "test";
}
