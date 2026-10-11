import type { PaymentProvider, PaymentStatus, Environment } from "../types/index.js";
export type AcquirerId = "sandbox" | "nexuspag" | "gothampay" | "smokepay" | "kavropay";
export type AcquirerHealthStatus = "healthy" | "degraded" | "down" | "unknown" | "unconfigured";
export interface AcquirerConfig {
  id: AcquirerId; displayName: string; enabled: boolean; priority: number;
  environment: Environment | "both"; costPercent: number; costFixedCents: number;
  minAmountCents: number; maxAmountCents: number; configured: boolean;
  healthStatus: AcquirerHealthStatus;
}
export interface CreateChargeContext {
  organizationId: string; amountCents: number; currency: string; description?: string;
  externalId: string; webhookUrl?: string; expirationSeconds?: number;
  metadata?: Record<string, unknown>; attempt: number; attemptedProviders: AcquirerId[];
}
export interface ChargeAttemptResult {
  providerId: AcquirerId; success: boolean; providerPaymentId?: string; status?: PaymentStatus;
  pix?: { txid: string; copyPaste: string; qrCodeBase64: string; expiresAt: string; feeAmountCents: number; netAmountCents: number };
  errorCode?: string; errorMessage?: string; retryable?: boolean; ambiguous?: boolean;
  rawResponse?: unknown; latencyMs: number;
}
export interface AcquirerAdapter extends PaymentProvider {
  id: AcquirerId;
  isConfigured(): boolean;
  healthCheck(): Promise<{ status: AcquirerHealthStatus; message?: string; latencyMs?: number }>;
  getLimits(): { minAmountCents: number; maxAmountCents: number };
  getConfiguredCost(): { percent: number; fixedCents: number };
}
export interface FeeRuleSnapshot {
  mode: "provider_plus_margin" | "provider_only" | "custom_total";
  providerCostPercent: number; providerCostFixedCents: number;
  fluxpayMarginPercent: number; fluxpayFixedCents: number;
  totalPercent: number; totalFixedCents: number;
  ruleSource: "individual" | "global" | "fallback";
  ruleId?: string | null; calculatedAt: string; providerId: AcquirerId;
}
