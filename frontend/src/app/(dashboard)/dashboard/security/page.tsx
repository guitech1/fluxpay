import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Antifraude / segurança de plataforma não fica no painel do lojista.
 * Só no ADM (/admin/security e sala de controle).
 */
export default function SecurityRedirect() {
  redirect("/dashboard");
}
