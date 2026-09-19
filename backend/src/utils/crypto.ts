import { createHash, randomBytes, createHmac, timingSafeEqual } from "crypto";

/**
 * Generate a secure API key.
 * Format: {prefix}_{env}_{random}
 * e.g. sk_test_51Hx... or pk_live_...
 */
export function generateApiKey(
  type: "secret" | "publishable",
  environment: "test" | "live"
): { fullKey: string; prefix: string; hash: string } {
  const typePrefix = type === "secret" ? "sk" : "pk";
  const envPrefix = environment === "test" ? "test" : "live";
  const random = randomBytes(24).toString("base64url");
  const fullKey = `${typePrefix}_${envPrefix}_${random}`;
  const prefix = `${typePrefix}_${envPrefix}_`;
  const hash = hashApiKey(fullKey);

  return { fullKey, prefix, hash };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Webhook signature (HMAC-SHA256)
 * Header: FluxPay-Signature: t=timestamp,v1=signature
 */
export function signWebhookPayload(
  payload: string,
  secret: string,
  timestamp?: number
): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;
  const signature = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${ts},v1=${signature}`;
}

export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 300
): boolean {
  try {
    const parts = signatureHeader.split(",");
    const timestampPart = parts.find((p) => p.startsWith("t="));
    const signaturePart = parts.find((p) => p.startsWith("v1="));

    if (!timestampPart || !signaturePart) return false;

    const timestamp = parseInt(timestampPart.slice(2), 10);
    const signature = signaturePart.slice(3);

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) return false;

    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    const sigBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");

    if (sigBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}
