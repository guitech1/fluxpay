/**
 * Tipos das linhas do banco que o painel realmente le.
 * Espelham as migrations 001–010 + KYC (nao sao gerados automaticamente).
 */

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

export type OrgRole = "owner" | "admin" | "developer" | "viewer";

export type OrgKycStatus = "none" | "pending" | "verified" | "rejected";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  legal_name: string | null;
  document: string | null;
  email: string;
  phone: string | null;
  website: string | null;
  country: string | null;
  timezone: string | null;
  default_currency: string | null;
  status: string;
  status_reason: string | null;
  status_changed_at: string | null;
  created_at: string;
  kyc_required?: boolean;
  kyc_status?: OrgKycStatus;
  kyc_verified_at?: string | null;
  kyc_document_type?: string | null;
  kyc_document_masked?: string | null;
  kyc_rejection_reason?: string | null;
}

export interface Payment {
  id: string;
  customer_id: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  description: string | null;
  payment_type: string | null;
  provider: string | null;
  provider_txid: string | null;
  provider_external_id: string | null;
  fee_amount: number | null;
  net_amount: number | null;
  paid_at: string | null;
  expires_at: string | null;
  created_at: string;
  customers?: { id: string; name: string | null; email: string | null } | null;
  /** Nome de quem pagou o PIX (webhook da adquirente). */
  payer_name?: string | null;
  payer_document?: string | null;
}

export interface Customer {
  id: string;
  external_id: string | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  document: string | null;
  created_at: string;
}

export interface Refund {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  status: string;
  reason: string | null;
  created_at: string;
}

export interface ApiKey {
  id: string;
  name: string | null;
  prefix: string;
  last4: string | null;
  key_type: string;
  environment: Environment;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  secret: string | null;
  active: boolean;
  created_at: string;
}

export interface BalanceRow {
  currency: string;
  available: number;
  pending: number;
}
