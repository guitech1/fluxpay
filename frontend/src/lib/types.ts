/**
 * Tipos das linhas do banco que o painel realmente le.
 * Espelham as migrations 001–010 (nao sao gerados automaticamente: o objetivo
 * aqui e ser explicito sobre o subconjunto de colunas que a UI usa).
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
  // Referencia que o proprio lojista informa na criacao da cobranca
  // (idempotency_key) — coluna real desde a migration 006. So a pagina de
  // detalhe (payments/[id]) seleciona e exibe esse campo por enquanto.
  provider_external_id: string | null;
  fee_amount: number | null;
  net_amount: number | null;
  paid_at: string | null;
  expires_at: string | null;
  created_at: string;
  customers?: { id: string; name: string | null; email: string | null } | null;
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

export interface Dispute {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  status: string;
  reason: string | null;
  evidence_due_by: string | null;
  created_at: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key_type: "secret" | "publishable";
  environment: Environment;
  key_prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  description: string | null;
  enabled: boolean;
  created_at: string;
}

export interface ApiLog {
  id: string;
  method: string;
  path: string;
  status_code: number | null;
  duration_ms: number | null;
  request_id: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface Member {
  id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
  users?: { id: string; email: string; full_name: string | null } | null;
}

/** Eventos que um endpoint de webhook pode assinar (enum webhook_event_type). */
export const WEBHOOK_EVENTS = [
  "payment.created",
  "payment.pending",
  "payment.succeeded",
  "payment.failed",
  "payment.refunded",
  "payment.canceled",
  "refund.created",
  "refund.succeeded",
  "refund.failed",
  "dispute.created",
  "dispute.updated",
] as const;
