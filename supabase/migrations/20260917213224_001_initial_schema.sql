-- FluxPay Initial Schema
-- PostgreSQL + Supabase with RLS

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE environment_type AS ENUM ('test', 'live');
CREATE TYPE payment_status AS ENUM (
  'pending',
  'processing',
  'succeeded',
  'failed',
  'canceled',
  'refunded',
  'partially_refunded'
);
CREATE TYPE refund_status AS ENUM ('pending', 'succeeded', 'failed', 'canceled');
CREATE TYPE dispute_status AS ENUM ('needs_response', 'under_review', 'won', 'lost', 'warning');
CREATE TYPE webhook_event_type AS ENUM (
  'payment.created',
  'payment.pending',
  'payment.succeeded',
  'payment.failed',
  'payment.refunded',
  'payment.canceled',
  'refund.created',
  'refund.succeeded',
  'refund.failed',
  'dispute.created',
  'dispute.updated'
);
CREATE TYPE webhook_delivery_status AS ENUM ('pending', 'success', 'failed', 'retrying');
CREATE TYPE api_key_type AS ENUM ('secret', 'publishable');

-- ============================================
-- ORGANIZATIONS (empresas)
-- ============================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  legal_name TEXT,
  document TEXT, -- CNPJ / Tax ID
  email TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  logo_url TEXT,
  country TEXT DEFAULT 'BR',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  default_currency TEXT DEFAULT 'BRL',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_status ON organizations(status);

-- ============================================
-- USERS (linked to Supabase Auth)
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================
-- ORGANIZATION MEMBERS
-- ============================================
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'developer', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);

-- ============================================
-- API KEYS
-- ============================================
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_type api_key_type NOT NULL DEFAULT 'secret',
  environment environment_type NOT NULL DEFAULT 'test',
  key_prefix TEXT NOT NULL, -- e.g. pk_test_, sk_live_
  key_hash TEXT NOT NULL, -- bcrypt/argon2 hash of the secret
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_env ON api_keys(environment);

-- ============================================
-- CUSTOMERS
-- ============================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment environment_type NOT NULL DEFAULT 'test',
  external_id TEXT, -- merchant's own customer id
  email TEXT,
  name TEXT,
  phone TEXT,
  document TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_customers_org ON customers(organization_id);
CREATE INDEX idx_customers_email ON customers(organization_id, email);
CREATE INDEX idx_customers_external ON customers(organization_id, external_id);
CREATE INDEX idx_customers_env ON customers(environment);

-- ============================================
-- PAYMENT METHODS (tokenized references only)
-- ============================================
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  environment environment_type NOT NULL DEFAULT 'test',
  type TEXT NOT NULL, -- card, pix, boleto, etc.
  provider TEXT, -- stripe, adyen, local_acquirer...
  provider_token TEXT, -- token from provider (never full PAN)
  brand TEXT, -- visa, mastercard...
  last4 TEXT,
  exp_month INT,
  exp_year INT,
  is_default BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_payment_methods_org ON payment_methods(organization_id);
CREATE INDEX idx_payment_methods_customer ON payment_methods(customer_id);

-- ============================================
-- PAYMENTS
-- ============================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  environment environment_type NOT NULL DEFAULT 'test',
  
  amount BIGINT NOT NULL, -- in cents
  currency TEXT NOT NULL DEFAULT 'BRL',
  status payment_status NOT NULL DEFAULT 'pending',
  
  description TEXT,
  statement_descriptor TEXT,
  
  -- Idempotency
  idempotency_key TEXT,
  
  -- Provider layer (separated from FluxPay core)
  provider TEXT,
  provider_payment_id TEXT,
  provider_response JSONB,
  
  -- Fees
  fee_amount BIGINT DEFAULT 0,
  net_amount BIGINT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  authorized_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  UNIQUE(organization_id, idempotency_key)
);

CREATE INDEX idx_payments_org ON payments(organization_id);
CREATE INDEX idx_payments_status ON payments(organization_id, status);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_created ON payments(organization_id, created_at DESC);
CREATE INDEX idx_payments_env ON payments(environment);
CREATE INDEX idx_payments_provider ON payments(provider_payment_id);

-- ============================================
-- REFUNDS
-- ============================================
CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  environment environment_type NOT NULL DEFAULT 'test',
  
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  status refund_status NOT NULL DEFAULT 'pending',
  reason TEXT,
  
  provider_refund_id TEXT,
  provider_response JSONB,
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_refunds_org ON refunds(organization_id);
CREATE INDEX idx_refunds_payment ON refunds(payment_id);

-- ============================================
-- DISPUTES
-- ============================================
CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  environment environment_type NOT NULL DEFAULT 'test',
  
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  status dispute_status NOT NULL DEFAULT 'needs_response',
  reason TEXT,
  
  provider_dispute_id TEXT,
  evidence_due_by TIMESTAMPTZ,
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_disputes_org ON disputes(organization_id);
CREATE INDEX idx_disputes_payment ON disputes(payment_id);

-- ============================================
-- BALANCE & TRANSACTIONS (ledger)
-- ============================================
CREATE TABLE balance_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment environment_type NOT NULL DEFAULT 'test',
  
  type TEXT NOT NULL, -- charge, refund, fee, payout, adjustment
  amount BIGINT NOT NULL, -- can be negative
  currency TEXT NOT NULL DEFAULT 'BRL',
  net BIGINT NOT NULL,
  fee BIGINT DEFAULT 0,
  
  payment_id UUID REFERENCES payments(id),
  refund_id UUID REFERENCES refunds(id),
  description TEXT,
  
  available_on TIMESTAMPTZ, -- when funds become available
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_balance_tx_org ON balance_transactions(organization_id);
CREATE INDEX idx_balance_tx_created ON balance_transactions(organization_id, created_at DESC);

-- ============================================
-- WEBHOOK ENDPOINTS
-- ============================================
CREATE TABLE webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment environment_type NOT NULL DEFAULT 'test',
  
  url TEXT NOT NULL,
  secret TEXT NOT NULL, -- for signature verification
  events TEXT[] NOT NULL DEFAULT '{}', -- list of subscribed events
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_webhook_endpoints_org ON webhook_endpoints(organization_id);

-- ============================================
-- WEBHOOK EVENTS & DELIVERIES
-- ============================================
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment environment_type NOT NULL DEFAULT 'test',
  
  type webhook_event_type NOT NULL,
  data JSONB NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_webhook_events_org ON webhook_events(organization_id);
CREATE INDEX idx_webhook_events_type ON webhook_events(type);

CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  webhook_event_id UUID NOT NULL REFERENCES webhook_events(id) ON DELETE CASCADE,
  
  status webhook_delivery_status NOT NULL DEFAULT 'pending',
  attempt_count INT DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  
  request_headers JSONB,
  request_body JSONB,
  response_status INT,
  response_body TEXT,
  response_headers JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries(webhook_endpoint_id);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE status = 'retrying';

-- ============================================
-- CHECKOUT SESSIONS
-- ============================================
CREATE TABLE checkout_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment environment_type NOT NULL DEFAULT 'test',
  
  customer_id UUID REFERENCES customers(id),
  payment_id UUID REFERENCES payments(id),
  
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'complete', 'expired')),
  
  success_url TEXT,
  cancel_url TEXT,
  
  line_items JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_checkout_sessions_org ON checkout_sessions(organization_id);

-- ============================================
-- API LOGS (audit)
-- ============================================
CREATE TABLE api_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  environment environment_type,
  
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INT,
  request_id TEXT,
  ip_address INET,
  user_agent TEXT,
  
  request_body JSONB,
  response_body JSONB,
  duration_ms INT,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_api_logs_org ON api_logs(organization_id);
CREATE INDEX idx_api_logs_created ON api_logs(created_at DESC);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_refunds_updated_at BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_disputes_updated_at BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_webhook_endpoints_updated_at BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_checkout_sessions_updated_at BEFORE UPDATE ON checkout_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
