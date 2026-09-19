/**
 * Guarda de escopo multi-tenant — SEM nenhuma dependencia externa, de
 * proposito: e a ultima linha de defesa e precisa ser trivialmente testavel.
 *
 * Regra do sistema: todo recurso de negocio pertence a uma organizacao E a um
 * ambiente (test/live), e a chave de API (ou a sessao + header X-Environment
 * ja conferidos pelo backend) decide os dois. Uma consulta que filtre apenas
 * por `id`, ou apenas por `organization_id`, deixa passar recurso do outro
 * ambiente da mesma empresa — foi exatamente assim que uma chave sk_test_
 * conseguia cancelar e reembolsar cobranca de producao.
 *
 * O filtro na query continua sendo a defesa principal (e o que usa indice).
 * Estas funcoes sao a conferencia depois da leitura: se algum dia um `.eq()`
 * for esquecido numa refatoracao, o recurso e recusado em vez de vazar.
 */

export interface ScopedResource {
  organization_id?: string | null;
  environment?: string | null;
}

/**
 * true somente quando o recurso pertence a ESTA organizacao e a ESTE ambiente.
 *
 * Recurso nulo, sem organizacao ou sem ambiente e sempre fora de escopo:
 * "nao sei a quem pertence" nunca pode ser lido como "pertence a quem pediu".
 */
export function isInScope(
  resource: ScopedResource | null | undefined,
  organizationId: string,
  environment: string
): boolean {
  if (!resource) return false;
  if (!organizationId || !environment) return false;
  if (!resource.organization_id || !resource.environment) return false;
  return resource.organization_id === organizationId && resource.environment === environment;
}

/**
 * Devolve o recurso quando ele esta no escopo, ou `null` quando nao esta.
 *
 * O chamador transforma `null` em 404 (nunca 403): confirmar que o id existe
 * "mas e de outro ambiente" ja e informacao demais para quem nao deveria
 * enxergar aquele recurso.
 */
export function inScopeOrNull<T extends ScopedResource>(
  resource: T | null | undefined,
  organizationId: string,
  environment: string
): T | null {
  return isInScope(resource, organizationId, environment) ? (resource as T) : null;
}
