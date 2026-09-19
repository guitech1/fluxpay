import { supabaseAdmin } from "../../backend/dist/config/supabase.js";
import { processRetryingWebhooks } from "../../backend/dist/services/webhooks.js";
import {
  reconcileOrphanPixCharges,
  reprocessUnmatchedProviderEvents,
} from "../../backend/dist/services/payments.js";

/**
 * Job de manutencao periodica. Substitui o que, num servidor tradicional,
 * seria um setInterval/cron dentro do processo — aqui roda como funcao
 * agendada da Netlify porque a funcao da API (api.ts) e stateless e nao
 * fica de pe entre requisicoes.
 *
 * Quatro responsabilidades, nesta ordem:
 *
 * 1. Reprocessar eventos do adquirente que ficaram sem par.
 *    Sao webhooks autenticados e gravados que, na chegada, nao encontraram
 *    cobranca local. Vem primeiro porque confirmar um pagamento ja pago e
 *    mais urgente do que qualquer outra coisa nesta lista — e porque, se
 *    confirmar, a cobranca sai do conjunto de "orfas" do passo 2.
 *
 * 2. Reconciliar cobrancas PIX orfas (pendentes, sem txid). Consulta o
 *    adquirente pelo external_id e conclui: confirma, completa os dados ou
 *    encerra. Fecha a janela em que a chamada ao adquirente falhou de forma
 *    ambigua.
 *
 * 3. Expirar sessoes de checkout e cobrancas PIX vencidas.
 *
 * 4. Reenviar webhooks de SAIDA em "retrying" cujo horario ja venceu.
 *
 * Os passos 1 e 2 sao o que torna a recuperacao AUTOMATICA: o painel
 * administrativo continua oferecendo reprocessamento manual para inspecao e
 * casos excepcionais, mas nao e mais o caminho normal de recuperacao de um
 * pagamento.
 */
export default async () => {
  const events = await reprocessUnmatchedProviderEvents().catch((err) => {
    console.error("Erro ao reprocessar eventos do adquirente:", err);
    return { checked: 0, confirmed: 0 };
  });

  const orphans = await reconcileOrphanPixCharges().catch((err) => {
    console.error("Erro ao reconciliar cobrancas PIX orfas:", err);
    return { checked: 0, confirmed: 0, attached: 0, failed: 0 };
  });

  const { data: expired, error: expireError } = await supabaseAdmin.rpc(
    "fluxpay_expire_stale_records"
  );
  if (expireError) {
    console.error("Erro ao expirar registros vencidos:", expireError);
  }

  const { processed } = await processRetryingWebhooks();

  return new Response(
    JSON.stringify({
      provider_events: events,
      orphan_pix: orphans,
      expired: expired ?? null,
      webhooks_retried: processed,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
};

// Formato "v2" das Netlify Functions: basta exportar `config` com o cron.
// A cada 10 minutos.
export const config = {
  schedule: "*/10 * * * *",
};
