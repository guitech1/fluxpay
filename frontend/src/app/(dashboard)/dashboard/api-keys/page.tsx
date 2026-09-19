import { redirect } from "next/navigation";

/**
 * Rota antiga. As chaves passaram a viver em /dashboard/api, junto da
 * documentacao. Mantida apenas como redirecionamento para nao quebrar link
 * salvo por quem ja usava o painel — nao ha conteudo proprio aqui.
 */
export default function ApiKeysRedirect() {
  redirect("/dashboard/api");
}
