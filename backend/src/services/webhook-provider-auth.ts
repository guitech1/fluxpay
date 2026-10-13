/**
 * Resolve which acquirer webhook secret to use for /v1/webhooks/provider.
 * Never trusts an attacker-controlled query alone without binding to a verified signature.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { verifyWebhookSignature } from "../utils/crypto.js";

export type ProviderSecretMap = Record<string, string | undefined>;

export const KNOWN_PROVIDER_IDS = [
  "nexuspag",
  "profanuspay",
  "gothampay",
  "smokepay",
  "kavropay",
] as const;

export type KnownProviderId = (typeof KNOWN_PROVIDER_IDS)[number];

export function secretsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ProviderSecretMap {
  return {
    nexuspag: env.NEXUSPAG_WEBHOOK_SECRET,
    profanuspay: env.PROFANUSPAY_WEBHOOK_SECRET,
    gothampay: env.GOTHAMPAY_WEBHOOK_SECRET,
    smokepay: env.SMOKEPAY_WEBHOOK_SECRET,
    kavropay: env.KAVROPAY_WEBHOOK_SECRET,
  };
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function verifyKavro(rawBody: string, signatureHeader: string, secret: string): boolean {
  const calculated = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(signatureHeader, calculated);
}

export interface VerifyProviderWebhookInput {
  /** Optional ?provider= from callback URL (set by our adapters, not trusted alone). */
  claimedProvider: string | null;
  signatureHeader: string;
  rawBody: string;
  isKavroHeader: boolean;
  secrets: ProviderSecretMap;
}

export type VerifyProviderWebhookResult =
  | {
      ok: true;
      providerId: string;
      secretUsedLabel: string;
    }
  | {
      ok: false;
      reason:
        | "missing_signature"
        | "unknown_provider"
        | "secret_not_configured"
        | "invalid_signature";
    };

/**
 * Verify webhook signature against the correct secret(s).
 *
 * - If claimedProvider is set: ONLY that provider's secret is tried (no cross-secret fallback).
 * - If claimedProvider is absent: try all configured secrets; first match wins.
 *   Callers MUST still bind matched provider to payment.provider when available.
 */
export function verifyProviderWebhook(
  input: VerifyProviderWebhookInput
): VerifyProviderWebhookResult {
  const { claimedProvider, signatureHeader, rawBody, isKavroHeader, secrets } = input;

  if (!signatureHeader) {
    return { ok: false, reason: "missing_signature" };
  }

  const trySecret = (secret: string): boolean => {
    if (isKavroHeader) return verifyKavro(rawBody, signatureHeader, secret);
    return verifyWebhookSignature(rawBody, signatureHeader, secret);
  };

  if (claimedProvider) {
    const id = claimedProvider.toLowerCase();
    if (!(KNOWN_PROVIDER_IDS as readonly string[]).includes(id)) {
      return { ok: false, reason: "unknown_provider" };
    }
    const secret = secrets[id];
    if (!secret) {
      return { ok: false, reason: "secret_not_configured" };
    }
    if (!trySecret(secret)) {
      return { ok: false, reason: "invalid_signature" };
    }
    return { ok: true, providerId: id, secretUsedLabel: id };
  }

  // No claim: verify against each configured secret (order fixed, deterministic).
  for (const id of KNOWN_PROVIDER_IDS) {
    const secret = secrets[id];
    if (!secret) continue;
    if (trySecret(secret)) {
      return { ok: true, providerId: id, secretUsedLabel: id };
    }
  }

  const anyConfigured = KNOWN_PROVIDER_IDS.some((id) => Boolean(secrets[id]));
  if (!anyConfigured) {
    return { ok: false, reason: "secret_not_configured" };
  }
  return { ok: false, reason: "invalid_signature" };
}

/**
 * After signature verification, ensure the payment's stored provider matches
 * the secret that verified the webhook (when payment has a known acquirer).
 */
export function paymentProviderMatchesClaim(
  paymentProvider: string | null | undefined,
  verifiedProviderId: string
): boolean {
  if (!paymentProvider) return true;
  const p = paymentProvider.toLowerCase();
  if (p === "sandbox") return true;
  if (!(KNOWN_PROVIDER_IDS as readonly string[]).includes(p)) return false;
  return p === verifiedProviderId;
}
