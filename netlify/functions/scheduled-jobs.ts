import { supabaseAdmin } from "../../backend/dist/config/supabase.js";
import { processRetryingWebhooks } from "../../backend/dist/services/webhooks.js";
import {
  reconcileOrphanPixCharges,
  reprocessUnmatchedProviderEvents,
} from "../../backend/dist/services/payments.js";

/**
 * Job de manutencao periodica.
 *
 * No plano Free da Netlify, Scheduled Functions (cron) nao estao disponiveis
 * e declarar `schedule` no export config pode derrubar o build. Por isso o
 * cron fica desligado aqui; a funcao continua invocavel manualmente e pode
 * voltar a ser agendada no netlify.toml ao subir de plano.
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

// Cron desligado no Free. Para reativar (plano Pro+):
// export const config = { schedule: "*/10 * * * *" };
