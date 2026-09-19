import { redirect } from "next/navigation";

/**
 * Rota antiga e publica. A documentacao da API passou a viver dentro do
 * painel, em /dashboard/api, junto das chaves — endpoints, formato de payload
 * e regras de ambiente sao informacao de quem ja e cliente.
 *
 * O bloqueio de verdade acontece no middleware (frontend/src/middleware.ts),
 * que redireciona /docs antes desta pagina renderizar. Este redirect fica como
 * segunda camada: se o `matcher` do middleware mudar um dia, a rota continua
 * nao servindo conteudo. Mesmo padrao usado em /dashboard/api-keys.
 *
 * O conteudo estatico que existia aqui foi removido de proposito: era uma
 * copia desatualizada do que ApiDocs.tsx ja mostra (e com a marca antiga).
 */
export default function DocsRedirect() {
  redirect("/dashboard/api");
}
