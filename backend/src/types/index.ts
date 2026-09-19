export type Environment = "test" | "live";

export type PaymentStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled"
  | "refunded"
  | "partially_refunded"
  | "expired"; // adicionado na migration 005 (cobranças PIX que vencem sem pagamento)

export type RefundStatus = "pending" | "succeeded" | "failed" | "canceled";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  email: string;
  status: string;
  default_currency: string;
  created_at: string;
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
  // Campos PIX (migration 006) — nulos para pagamentos por cartao
  payment_type?: "card" | "pix" | "boleto" | "spei" | "transfer" | "wallet";
  provider_txid?: string | null;
  provider_external_id?: string | null;
  pix_copy_paste?: string | null;
  pix_qr_code_base64?: string | null;
  expires_at?: string | null;
  paid_at?: string | null;
  expired_at?: string | null;
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
  /** Validade da cobranca PIX em segundos. Padrao: 3600 (1 hora). */
  expires_in_seconds?: number;
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

/** Dados de uma cobranca PIX retornados por um provider (opcional — só quem suporta PIX preenche). */
export interface PixDetails {
  txid: string;
  copyPaste: string;
  qrCodeBase64: string;
  expiresAt: string;
  feeAmountCents: number;
  netAmountCents: number;
}

// Provider abstraction – never store full card data
export interface PaymentProvider {
  name: string;
  createPayment(params: {
    amount: number;
    currency: string;
    paymentMethodToken?: string;
    metadata?: Record<string, unknown>;
    // Campos opcionais usados por providers de PIX (ex.: NexusPag). Providers
    // de cartao simplesmente os ignoram.
    description?: string;
    externalId?: string;
    webhookUrl?: string;
    expirationSeconds?: number;
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
  /**
   * Consulta uma cobranca no adquirente.
   *
   * `reference` aceita o id do provider, o txid OU o external_id — a doc da
   * NexusPag diz explicitamente que GET /api/pix/{id} aceita os tres. E o que
   * permite a reconciliacao automatica encontrar uma cobranca cujo txid nunca
   * chegou a ser gravado localmente.
   *
   * `pix` e `providerPaymentId` sao opcionais: providers que nao fazem PIX
   * simplesmente nao os preenchem.
   */
  getPayment(reference: string): Promise<{
    status: PaymentStatus;
    providerPaymentId?: string;
    rawResponse?: unknown;
    pix?: PixDetails;
  }>;
  // Verificacao de assinatura de webhook NAO fica no provider: o formato
  // t=<unix>,v1=<hmac_hex> e o mesmo do FluxPay, entao as rotas usam
  // verifyWebhookSignature de utils/crypto.js diretamente.
}
