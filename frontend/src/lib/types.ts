export type Environment = "test" | "live";

export type OrganizationStatus = "active" | "pending" | "disabled" | "blocked";

export type PaymentStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "expired"
  | "canceled"
  | "refunded"
  | "partially_refunded";

export interface Organization {
  id: string;
  name: string;
  status: OrganizationStatus;
  kyc_required?: boolean;
  kyc_status?: string | null;
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
  name: string;
  prefix: string;
  key_type: "secret" | "publishable";
  environment: Environment;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  active: boolean;
  secret_hint?: string | null;
  created_at: string;
}

export interface BalanceBucket {
  currency: string;
  available: number;
  pending: number;
}
