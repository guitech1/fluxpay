import { supabaseAdmin } from "../../backend/dist/config/supabase.js";
import { processRetryingWebhooks } from "../../backend/dist/services/webhooks.js";

/**
 * Job de manutencao periodica. Substitui o que, num servidor tradicional,
 * seria um setInterval/cron dentro do processo — aqui roda como funcao
 * agendada da Netlify porque a funcao da API (api.ts) e stateless e nao
 * fica de pe entre requisicoes.
 *
 * Duas responsabilidades:
 * 1. Expira sessoes de checkout e cobrancas PIX vencidas (fluxpay_expire_stale_records).
 * 2. Reenvia webhooks que estao com status "retrying" e ja venceram o proximo tentativa.
 */
export default async () => {
  const { data: expired, error: expireError } = await supabaseAdmin.rpc(
    "fluxpay_expire_stale_records"
  );
  if (expireError) {
    console.error("Erro ao expirar registros vencidos:", expireError);
  }

  const { processed } = await processRetryingWebhooks();

  return new Response(
    JSON.stringify({ expired: expired ?? null, webhooks_retried: processed }),
    { headers: { "Content-Type": "application/json" } }
  );
};

// Formato "v2" das Netlify Functions: basta exportar `config` com o cron.
// A cada 10 minutos.
export const config = {
  schedule: "*/10 * * * *",
};
