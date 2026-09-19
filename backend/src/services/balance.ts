import { supabaseAdmin } from "../config/supabase.js";
import type { Environment } from "../types/index.js";

interface BalanceBucket {
  amount: number;
  currency: string;
}

/**
 * Saldo da organizacao no ambiente da chave, agregado POR MOEDA.
 *
 * disponivel = soma do `net` cujo `available_on` ja passou (ou e nulo)
 * a liberar  = soma do `net` cujo `available_on` ainda esta no futuro
 *
 * A versao anterior somava todas as linhas num unico total e rotulava o
 * resultado como "BRL" fixo: uma transacao em outra moeda entrava no mesmo
 * balde e saia como real. O painel nunca mostrou isso porque le o RPC
 * get_organization_balance (migration 006), que ja agrupa por moeda — ou
 * seja, GET /v1/balance e a tela de Carteira podiam divergir para a mesma
 * empresa. Esta funcao passa a seguir a mesma regra do RPC.
 *
 * O formato da resposta nao mudou: { available: [...], pending: [...] }.
 */
export async function getBalance(organizationId: string, environment: Environment) {
  const now = new Date().toISOString();

  const { data: txs } = await supabaseAdmin
    .from("balance_transactions")
    .select("net, available_on, currency")
    .eq("organization_id", organizationId)
    .eq("environment", environment);

  const available = new Map<string, number>();
  const pending = new Map<string, number>();

  for (const tx of txs || []) {
    const currency = (tx.currency || "BRL").toUpperCase();
    const target = !tx.available_on || tx.available_on <= now ? available : pending;
    target.set(currency, (target.get(currency) || 0) + (tx.net || 0));
  }

  // Toda moeda que aparece em um dos lados precisa aparecer no outro, mesmo
  // que zerada — senao quem consome a API teria de cruzar duas listas de
  // tamanhos diferentes para montar uma linha por moeda.
  const currencies = new Set<string>([...available.keys(), ...pending.keys()]);

  // Sem nenhuma movimentacao devolvemos BRL zerado em vez de listas vazias:
  // conta nova tem saldo zero, nao "saldo desconhecido".
  if (currencies.size === 0) currencies.add("BRL");

  const toBuckets = (map: Map<string, number>): BalanceBucket[] =>
    [...currencies].sort().map((currency) => ({ amount: map.get(currency) || 0, currency }));

  return {
    object: "balance",
    available: toBuckets(available),
    pending: toBuckets(pending),
    livemode: environment === "live",
  };
}
