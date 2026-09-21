import { supabaseAdmin } from "../../backend/dist/config/supabase.js";
import { processRetryingWebhooks } from "../../backend/dist/services/webhooks.js";
import {
  reconcileOrphanPixCharges,
  reprocessUnmatchedProviderEvents,
} from "../../backend/dist/services/payments.js";

/**
 * Job de manutencao periodica.
 * Cron desligado no plano Free (Scheduled Functions = Pro).
 * Reative com: export const config = { schedule: "*\/10 * * * *" };
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
