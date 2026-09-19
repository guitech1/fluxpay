import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabase.js";
import { isInScope } from "../utils/scope.js";

/**
 * Idempotencia da criacao de cobranca — primeira camada.
 *
 * A busca e por organizacao + AMBIENTE + chave. O ambiente entra aqui porque
 * a mesma referencia ("pedido-1042") costuma ser usada primeiro em teste e
 * depois em producao: sem o filtro, a chamada de producao recebia de volta a
 * cobranca de TESTE, com QR Code falso, como se fosse idempotencia. A
 * constraint que sustenta isso no banco e UNIQUE(organization_id,
 * environment, idempotency_key) — migration 013.
 *
 * SOBRE A CORRIDA: este middleware sozinho NAO resolve duas requisicoes
 * simultaneas. Duas chamadas que cheguem no mesmo instante fazem o SELECT
 * antes de qualquer INSERT existir, nenhuma enxerga a outra, e as duas
 * seguem em frente. Quem arbitra e o banco:
 *
 *   - services/payments.ts grava a linha ANTES de chamar o adquirente;
 *   - a segunda gravacao bate na UNIQUE e recebe 23505;
 *   - o 23505 e tratado la como "ja existe" e a resposta devolve a MESMA
 *     cobranca, em vez de criar outra.
 *
 * Ou seja: este middleware e um atalho (evita a ida ao adquirente no caso
 * comum, em que a repeticao vem segundos ou minutos depois), e a unique do
 * banco e a garantia. Os dois juntos, nao um dos dois.
 */
export async function idempotencyCheck(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const key = (req.headers["idempotency-key"] as string) || req.body?.idempotency_key;

  if (!key || !req.auth) {
    next();
    return;
  }

  // Store on request for later use by controller
  (req as any).idempotencyKey = key;

  try {
    const { data: existing } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("organization_id", req.auth.organizationId)
      .eq("environment", req.auth.environment)
      .eq("idempotency_key", key)
      .maybeSingle();

    // Conferencia depois da leitura (utils/scope.ts). Os `.eq()` acima ja
    // deveriam bastar; esta linha garante que uma resposta idempotente NUNCA
    // devolva cobranca de outro ambiente, mesmo que um filtro se perca numa
    // refatoracao futura. Fora de escopo = segue como se nao existisse.
    if (existing && isInScope(existing, req.auth.organizationId, req.auth.environment)) {
      res.status(200).json({ data: existing, idempotent: true });
      return;
    }

    next();
  } catch {
    next();
  }
}
