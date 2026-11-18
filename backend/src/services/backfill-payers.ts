/**
 * Preenche payer_name / payer_document em cobranças PIX já pagas.
 *
 * 1) provider_events (payload do webhook já recebido — sem chamar adquirente)
 * 2) GET /api/pix/:ref na adquirente (consulta PIX da documentação Nexus-like)
 */
import { supabaseAdmin } from "../config/supabase.js";
import { getProvider } from "../providers/index.js";
import { extractPayerFromNexusPayload } from "../providers/nexus-like-base.js";
import { persistPayerInfo } from "./payments-queries.js";
import type { Environment } from "../types/index.js";

export type BackfillPayersResult = {
  from_events: number;
  from_api: number;
  checked_api: number;
  skipped: number;
  failed: number;
};

function nameFromPayload(payload: unknown): { name: string | null; document: string | null } {
  const { payerName, payerDocument } = extractPayerFromNexusPayload(payload);
  return { name: payerName, document: payerDocument };
}

/** Fase 1: usa webhooks já gravados em provider_events. */
async function backfillFromProviderEvents(): Promise<number> {
  const { data: events, error } = await supabaseAdmin
    .from("provider_events")
    .select("id, payment_id, payload")
    .not("payment_id", "is", null)
    .order("received_at", { ascending: false })
    .limit(500);

  if (error || !events?.length) return 0;

  let updated = 0;
  const seen = new Set<string>();

  for (const ev of events) {
    const paymentId = ev.payment_id as string;
    if (!paymentId || seen.has(paymentId)) continue;
    const { name, document } = nameFromPayload(ev.payload);
    if (!name) continue;

    const { data: pay } = await supabaseAdmin
      .from("payments")
      .select("id, payer_name")
      .eq("id", paymentId)
      .maybeSingle();

    if (!pay || pay.payer_name) continue;

    await persistPayerInfo(paymentId, { name, document });
    seen.add(paymentId);
    updated += 1;
  }

  return updated;
}

/** Fase 2: consulta PIX na adquirente para pagos sem nome. */
async function backfillFromAcquirerApi(limit: number): Promise<{
  updated: number;
  checked: number;
  skipped: number;
  failed: number;
}> {
  const { data: rows, error } = await supabaseAdmin
    .from("payments")
    .select(
      "id, provider, provider_txid, provider_payment_id, provider_external_id, environment, status, payment_type, payer_name"
    )
    .eq("status", "succeeded")
    .eq("payment_type", "pix")
    .is("payer_name", null)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error || !rows?.length) {
    return { updated: 0, checked: 0, skipped: 0, failed: 0 };
  }

  let updated = 0;
  let checked = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    checked += 1;
    const providerId = row.provider as string | null;
    const environment = row.environment as Environment;
    const ref =
      (row.provider_txid as string | null) ||
      (row.provider_payment_id as string | null) ||
      (row.provider_external_id as string | null);

    if (!providerId || providerId === "sandbox" || providerId === "queued" || !ref) {
      skipped += 1;
      continue;
    }

    try {
      const provider = getProvider(environment, providerId);
      const remote = await provider.getPayment(ref);
      let name = remote.pix?.payerName ?? null;
      let document = remote.pix?.payerDocument ?? null;

      if (!name && remote.rawResponse) {
        const fromRaw = extractPayerFromNexusPayload(remote.rawResponse);
        name = fromRaw.payerName;
        document = fromRaw.payerDocument;
      }

      if (!name) {
        skipped += 1;
        continue;
      }

      await persistPayerInfo(row.id as string, { name, document });
      updated += 1;
    } catch (err) {
      failed += 1;
      console.warn("[backfill-payers] falha ao consultar adquirente:", {
        paymentId: row.id,
        provider: providerId,
        ref,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  return { updated, checked, skipped, failed };
}

export async function backfillPayerNames(limit = 50): Promise<BackfillPayersResult> {
  const from_events = await backfillFromProviderEvents();
  const api = await backfillFromAcquirerApi(limit);
  return {
    from_events,
    from_api: api.updated,
    checked_api: api.checked,
    skipped: api.skipped,
    failed: api.failed,
  };
}
