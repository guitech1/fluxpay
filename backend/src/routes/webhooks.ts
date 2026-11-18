import { Router } from "express";
import { z } from "zod";
import { createHash } from "crypto";
import { apiKeyAuth, requireSecretKey } from "../middleware/auth.js";
import { createWebhookEndpoint } from "../services/webhooks.js";
import { supabaseAdmin } from "../config/supabase.js";
import { env } from "../config/env.js";
import { verifyWebhookSignature } from "../utils/crypto.js";
import {
  secretsFromEnv,
  paymentProviderMatchesClaim,
  verifyProviderWebhook,
} from "../services/webhook-provider-auth.js";
import {
  getPaymentByProviderReference,
  markPixPaymentSucceeded,
  persistPayerInfo,
} from "../services/payments.js";
import { decideWebhookAction } from "../services/provider-events.js";
import { notifyAfterPixConfirmed } from "../services/payments-queries-notify.js";
import { findOrgIdByKycProviderIds } from "../services/kyc.js";

const router = Router();

router.post("/", apiKeyAuth, requireSecretKey, async (req, res, next) => {
  try {
    const body = z
      .object({
        url: z.string().url(),
        events: z.array(z.string()).min(1),
        description: z.string().max(200).optional(),
      })
      .parse(req.body);

    const endpoint = await createWebhookEndpoint(
      req.apiKey!.organizationId,
      req.apiKey!.environment,
      body
    );
    res.status(201).json({ data: endpoint });
  } catch (err) {
    next(err);
  }
});

router.get("/", apiKeyAuth, requireSecretKey, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("webhook_endpoints")
      .select("id, url, events, description, active, created_at")
      .eq("organization_id", req.apiKey!.organizationId)
      .eq("environment", req.apiKey!.environment)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    next(err);
  }
});

interface NexusPagWebhookPayload {
  event?: string;
  transaction_id?: string;
  txid?: string;
  external_id?: string | null;
  status?: string;
  amount?: number;
  fee?: number;
  net_amount?: number;
  payer_name?: string;
  payer_document?: string;
  payer_document_masked?: string;
  paid_at?: string;
  verified_at?: string;
  rejection_reason?: string;
  shop_id?: string;
  shop_external_ref?: string;
  verification_id?: string;
  id?: string;
}

function extractPayer(payload: Record<string, unknown> | {
  payer_name?: string | null;
  payer_document?: string | null;
  payer_document_masked?: string | null;
  payerName?: string | null;
  payer?: { name?: string | null; document?: string | null } | null;
  transaction?: { payer_name?: string | null; payer_document?: string | null } | null;
}) {
  const p = payload as Record<string, unknown>;
  const nestedPayer = (p.payer && typeof p.payer === "object" ? p.payer : null) as {
    name?: string | null;
    document?: string | null;
  } | null;
  const tx = (p.transaction && typeof p.transaction === "object" ? p.transaction : null) as {
    payer_name?: string | null;
    payer_document?: string | null;
  } | null;
  const nameRaw =
    (typeof p.payer_name === "string" && p.payer_name) ||
    (typeof p.payerName === "string" && p.payerName) ||
    (nestedPayer?.name && String(nestedPayer.name)) ||
    (tx?.payer_name && String(tx.payer_name)) ||
    null;
  const docRaw =
    (typeof p.payer_document === "string" && p.payer_document) ||
    (typeof p.payer_document_masked === "string" && p.payer_document_masked) ||
    (nestedPayer?.document && String(nestedPayer.document)) ||
    (tx?.payer_document && String(tx.payer_document)) ||
    null;
  const name = nameRaw ? String(nameRaw).trim() || null : null;
  const document = docRaw ? String(docRaw).trim() || null : null;
  return { name, document };
}

router.post("/nexuspag", async (req, res, next) => {
  try {
    const rawBody: string | undefined = (req as any).rawBody;
    if (!rawBody) {
      res.status(500).json({ error: { type: "api_error", message: "rawBody nao capturado." } });
      return;
    }

    if (!env.NEXUSPAG_WEBHOOK_SECRET) {
      console.error(
        "NEXUSPAG_WEBHOOK_SECRET ausente — webhook da NexusPag recusado sem processar."
      );
      res.status(503).json({
        error: { type: "api_error", message: "Webhook secret nao configurado." },
      });
      return;
    }

    const signatureHeader = req.headers["x-webhook-signature"] as string | undefined;
    const signatureValid =
      !!signatureHeader &&
      verifyWebhookSignature(rawBody, signatureHeader, env.NEXUSPAG_WEBHOOK_SECRET);

    if (!signatureValid) {
      res.status(401).json({ error: { type: "authentication_error", message: "Assinatura invalida." } });
      return;
    }

    const payload = req.body as NexusPagWebhookPayload;
    const eventType =
      payload.event || (req.headers["x-webhook-event"] as string | undefined) || "unknown";

    if (eventType.startsWith("kyc.")) {
      const providerVerificationId =
        payload.verification_id || payload.id || payload.transaction_id || null;
      const externalId = payload.external_id || payload.shop_external_ref || null;
      const providerEventId = `${eventType}:${providerVerificationId || externalId || "unknown"}`;

      const orgId = await findOrgIdByKycProviderIds({
        providerVerificationId,
        externalId,
      });

      const { error: dedupeError } = await supabaseAdmin.from("provider_events").insert({
        provider: "nexuspag",
        provider_event_id: providerEventId,
        event_type: eventType,
        payload,
        signature_valid: true,
        organization_id: orgId,
        received_at: new Date().toISOString(),
      });

      if (dedupeError && (dedupeError as { code?: string }).code !== "23505") {
        console.error("Falha ao gravar provider_events kyc:", dedupeError);
      }

      res.status(200).json({
        received: true,
        kyc: true,
        providerVerificationId,
        organization_id: orgId,
        via: "nexuspag",
      });
      return;
    }

    const txid = payload.txid || payload.transaction_id || null;
    const externalId = payload.external_id || null;
    const providerEventId = `${eventType}:${txid || externalId}`;

    const payment = await getPaymentByProviderReference({ txid, externalId });

    const { data: insertedEvent, error: dedupeError } = await supabaseAdmin
      .from("provider_events")
      .insert({
        provider: "nexuspag",
        provider_event_id: providerEventId,
        event_type: eventType,
        payload,
        signature_valid: true,
        payment_id: payment?.id ?? null,
        organization_id: payment?.organization_id ?? null,
        environment: payment?.environment ?? null,
        received_at: new Date().toISOString(),
      })
      .select("id, processed_at")
      .maybeSingle();

    let alreadyProcessed = false;
    let eventId: string | null = insertedEvent?.id ?? null;

    if (dedupeError) {
      if ((dedupeError as { code?: string }).code === "23505") {
        const { data: existingEvent } = await supabaseAdmin
          .from("provider_events")
          .select("id, processed_at")
          .eq("provider", "nexuspag")
          .eq("provider_event_id", providerEventId)
          .maybeSingle();
        eventId = existingEvent?.id ?? null;
        alreadyProcessed = !!existingEvent?.processed_at;
      } else {
        console.error("Falha ao gravar provider_events:", dedupeError);
      }
    }

    const markProcessed = async (error?: string) => {
      if (eventId) {
        await supabaseAdmin
          .from("provider_events")
          .update({
            processed_at: new Date().toISOString(),
            processing_error: error ?? null,
            payment_id: payment?.id ?? null,
            organization_id: payment?.organization_id ?? null,
            environment: payment?.environment ?? null,
          })
          .eq("id", eventId);
        return;
      }
      await supabaseAdmin
        .from("provider_events")
        .update({ processed_at: new Date().toISOString(), processing_error: error ?? null })
        .eq("provider", "nexuspag")
        .eq("provider_event_id", providerEventId);
    };

    const decision = decideWebhookAction({
      eventType,
      status: payload.status,
      payment: payment ? { id: payment.id, status: payment.status } : null,
      alreadyProcessed,
    });

    const payer = extractPayer(payload as Record<string, unknown>);

    switch (decision.action) {
      case "duplicate":
        if (payment) await persistPayerInfo(payment.id, payer);
        res.status(200).json({ received: true, duplicate: true });
        return;

      case "confirm":
        await markPixPaymentSucceeded(payment!, payer);
        notifyAfterPixConfirmed(payment!);
        await markProcessed();
        res.status(200).json({ received: true });
        return;

      case "retry_later":
        await supabaseAdmin
          .from("provider_events")
          .update({ processing_error: decision.reason })
          .eq("provider", "nexuspag")
          .eq("provider_event_id", providerEventId);
        res.status(200).json({ received: true, pending_reconciliation: true });
        return;

      default:
        await markProcessed(decision.reason);
        res.status(200).json({ received: true, ignored: true });
        return;
    }
  } catch (err) {
    next(err);
  }
});

router.post("/provider", async (req, res, next) => {
  let providerEventRowId: string | null = null;
  let verifiedProviderId: string | null = null;
  let providerEventId: string | null = null;

  try {
    const claimedProvider =
      typeof req.query.provider === "string" ? req.query.provider.toLowerCase() : null;
    const signatureHeader =
      (req.headers["x-webhook-signature"] as string | undefined) ||
      (req.headers["x-kavro-signature"] as string | undefined) ||
      "";
    const isKavroHeader = Boolean(req.headers["x-kavro-signature"]);
    const rawBody = typeof (req as any).rawBody === "string" ? (req as any).rawBody : "";

    if (!rawBody) {
      res.status(500).json({ error: "raw_body_unavailable" });
      return;
    }

    const verification = verifyProviderWebhook({
      claimedProvider,
      signatureHeader,
      rawBody,
      isKavroHeader,
      secrets: secretsFromEnv(),
    });
    if (!verification.ok) {
      const status = verification.reason === "secret_not_configured" ? 503 : 401;
      res.status(status).json({ error: verification.reason });
      return;
    }
    verifiedProviderId = verification.providerId;

    const payload = req.body as {
      event?: string;
      transaction_id?: string;
      txid?: string;
      external_id?: string | null;
      status?: string;
      id?: string;
      payer_name?: string;
      payer_document?: string;
      payer_document_masked?: string;
      payer?: { name?: string; document?: string };
      transaction?: { payer_name?: string; payer_document?: string };
    };
    const eventType =
      payload.event ||
      (req.headers["x-webhook-event"] as string | undefined) ||
      "unknown";
    const txid = payload.txid || payload.transaction_id || null;
    const externalId = payload.external_id || null;
    providerEventId = `${eventType}:${txid || externalId || createHash("sha256").update(rawBody).digest("hex").slice(0, 16)}`;

    const { data: insertedEvent, error: insertError } = await supabaseAdmin
      .from("provider_events")
      .insert({
        provider: verifiedProviderId,
        provider_event_id: providerEventId,
        event_type: eventType,
        payload,
        signature_valid: true,
        received_at: new Date().toISOString(),
      })
      .select("id, processed_at")
      .maybeSingle();

    if (insertError) {
      if ((insertError as { code?: string }).code === "23505") {
        const { data: existingEvent, error: lookupError } = await supabaseAdmin
          .from("provider_events")
          .select("id, processed_at")
          .eq("provider", verifiedProviderId)
          .eq("provider_event_id", providerEventId)
          .maybeSingle();
        if (lookupError || !existingEvent) {
          res.status(500).json({ error: "provider_event_lookup_failed" });
          return;
        }
        if (existingEvent.processed_at) {
          res.status(200).json({ received: true, duplicate: true });
          return;
        }
        providerEventRowId = existingEvent.id;
      } else {
        throw insertError;
      }
    } else {
      providerEventRowId = insertedEvent?.id ?? null;
    }

    const payment = await getPaymentByProviderReference({ txid, externalId });
    const finishEvent = async (processingError?: string) => {
      if (!providerEventRowId) return;
      const update: Record<string, unknown> = {
        processed_at: new Date().toISOString(),
        processing_error: processingError ?? null,
      };
      if (payment) {
        update.payment_id = payment.id;
        update.organization_id = payment.organization_id;
        update.environment = payment.environment;
      }
      const { error } = await supabaseAdmin
        .from("provider_events")
        .update(update)
        .eq("id", providerEventRowId);
      if (error) console.error("[provider webhook] failed to finalize event:", error);
    };

    if (!payment) {
      if (providerEventRowId) {
        const { error } = await supabaseAdmin
          .from("provider_events")
          .update({ processing_error: "payment_not_found" })
          .eq("id", providerEventRowId);
        if (error) console.error("[provider webhook] failed to defer unmatched event:", error);
      }
      res.status(200).json({ received: true, matched: false, pending_reconciliation: true });
      return;
    }

    if (!paymentProviderMatchesClaim(payment.provider, verifiedProviderId)) {
      await finishEvent("payment_provider_mismatch");
      res.status(401).json({ error: "payment_provider_mismatch" });
      return;
    }

    const isPaid =
      eventType === "payment.confirmed" ||
      eventType === "charge.paid" ||
      payload.status === "paid";
    if (!isPaid) {
      await finishEvent("ignored_non_paid_event");
      res.status(200).json({ received: true, ignored: true });
      return;
    }

    if (payment.payment_type && payment.payment_type !== "pix") {
      await finishEvent("ignored_non_pix_payment");
      res.status(200).json({ received: true, ignored: true });
      return;
    }

    const payer = extractPayer(payload as Record<string, unknown>);

    if (payment.status === "succeeded") {
      await persistPayerInfo(payment.id, payer);
      await finishEvent();
      res.status(200).json({ received: true, already_processed: true });
      return;
    }

    await markPixPaymentSucceeded(payment, payer);
    notifyAfterPixConfirmed(payment);
    await finishEvent();
    res.status(200).json({ received: true, matched: true, payment_id: payment.id });
  } catch (err) {
    next(err);
  }
});

export default router;
