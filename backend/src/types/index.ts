export type Environment = "test" | "live";

export type PaymentStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled"
  | "refunded"
  | "partially_refunded"
  | "expired";

export type RefundStatus = "pending" | "succeeded" | "failed" | "canceled";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  email: string;
  status: string;
  default_currency: string;
  created_at: string;
  nexus_shop_id?: string | null;
  platform_fee_percent?: number | null;
}

export interface ApiKey {
  id: string;
  organization_id: string;
  name: string;
  key_type: "secret" | "publishable";
  environment: Environment;
  key_prefix: string;
  key_hash: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface Customer {
  id: string;
  organization_id: string;
  environment: Environment;
  external_id?: string | null;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  document?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface Payment {
  id: string;
  organization_id: string;
  customer_id?: string | null;
  environment: Environment;
  amount: number;
  currency: string;
  status: PaymentStatus;
  description?: string | null;
  idempotency_key?: string | null;
  provider?: string | null;
  provider_payment_id?: string | null;
  fee_amount: number;
  net_amount?: number | null;
  metadata?: Record<string, unknown>;
  payment_type?: "card" | "pix" | "boleto" | "spei" | "transfer" | "wallet";
  provider_txid?: string | null;
  provider_external_id?: string | null;
  pix_copy_paste?: string | null;
  pix_qr_code_base64?: string | null;
  expires_at?: string | null;
  paid_at?: string | null;
  expired_at?: string | null;
  payer_name?: string | null;
  payer_document?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePaymentInput {
  amount: number;
  currency?: string;
  customer_id?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  payment_method?: {
    type: string;
    token?: string;
  };
  idempotency_key?: string;
  expires_in_seconds?: number;
  /** Subconta SmokePay (shop_id / external_ref). Força provider smokepay. */
  shop_id?: string;
  /** % da plataforma no split parent (opcional). */
  platform_fee_percent?: number;
  splits?: Array<
    | { parent: true; amount?: number; percent?: number }
    | { shop_id: string; amount?: number; percent?: number }
  >;
}

export interface CreateCustomerInput {
  email?: string;
  name?: string;
  phone?: string;
  document?: string;
  external_id?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateRefundInput {
  amount?: number;
  idempotency_key: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateCheckoutSessionInput {
  amount: number;
  currency?: string;
  customer_id?: string;
  success_url: string;
  cancel_url: string;
  line_items?: Array<{
    name: string;
    amount: number;
    quantity?: number;
  }>;
  metadata?: Record<string, unknown>;
}

export interface AuthenticatedRequest {
  organizationId: string;
  environment: Environment;
  apiKeyId: string;
  apiKeyType: "secret" | "publishable";
}

export interface PixDetails {
  txid: string;
  copyPaste: string;
  qrCodeBase64: string;
  expiresAt: string;
  feeAmountCents: number;
  netAmountCents: number;
  payerName?: string | null;
  payerDocument?: string | null;
  paidAt?: string | null;
}

export interface PaymentProvider {
  name: string;
  createPayment(params: {
    amount: number;
    currency: string;
    paymentMethodToken?: string;
    metadata?: Record<string, unknown>;
    description?: string;
    externalId?: string;
    webhookUrl?: string;
    expirationSeconds?: number;
    shopId?: string;
    platformFeePercent?: number;
    splits?: Array<
      | { parent: true; amount?: number; percent?: number }
      | { shop_id: string; amount?: number; percent?: number }
    >;
  }): Promise<{
    providerPaymentId: string;
    status: PaymentStatus;
    rawResponse?: unknown;
    pix?: PixDetails;
  }>;
  refundPayment(params: {
    providerPaymentId: string;
    amount: number;
  }): Promise<{
    providerRefundId: string;
    status: RefundStatus;
    rawResponse?: unknown;
  }>;
  getPayment(reference: string): Promise<{
    status: PaymentStatus;
    providerPaymentId?: string;
    rawResponse?: unknown;
    pix?: PixDetails;
  }>;
}
