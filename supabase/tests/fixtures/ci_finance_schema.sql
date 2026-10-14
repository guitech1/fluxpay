-- Disposable PostgreSQL fixture for CI only. Never used against Supabase/live.
-- Shapes the minimal live-compatible finance schema so migrations 023–027
-- and SQL regressions can run without stubs of the functions under test.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $role$ BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $role$;

-- Minimal Supabase Auth surface for the push migrations in disposable CI Postgres.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $body$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $body$;

CREATE OR REPLACE FUNCTION public.support_set_updated_at() RETURNS trigger
LANGUAGE plpgsql
AS $body$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $body$;
CREATE OR REPLACE FUNCTION public.fluxpay_card_set_updated_at() RETURNS trigger
LANGUAGE plpgsql
AS $body$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $body$;

CREATE TYPE public.environment_type AS ENUM ('test', 'live');
CREATE TYPE public.payment_status AS ENUM (
  'pending','processing','succeeded','failed','canceled','expired','refunded','partially_refunded'
);
CREATE TYPE public.refund_status AS ENUM ('pending','succeeded','failed','canceled');

CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
INSERT INTO public.organizations(id, name)
VALUES ('00000000-0000-0000-0000-000000000000', 'synthetic CI organization');

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  environment public.environment_type NOT NULL,
  amount bigint NOT NULL,
  currency text NOT NULL,
  status public.payment_status NOT NULL,
  payment_type text NOT NULL,
  fee_amount bigint NOT NULL DEFAULT 0,
  net_amount bigint,
  description text,
  paid_at timestamptz,
  captured_at timestamptz
);

CREATE TABLE public.balance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  environment public.environment_type NOT NULL,
  type text NOT NULL,
  amount bigint NOT NULL,
  currency text NOT NULL,
  net bigint NOT NULL,
  fee bigint NOT NULL DEFAULT 0,
  payment_id uuid,
  refund_id uuid,
  description text,
  available_on timestamptz
);

CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  payment_id uuid NOT NULL REFERENCES public.payments(id),
  environment public.environment_type NOT NULL DEFAULT 'test',
  amount bigint NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  status public.refund_status NOT NULL DEFAULT 'pending',
  reason text,
  provider_refund_id text,
  provider_response jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.provider_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.webhook_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.users (id uuid PRIMARY KEY);

CREATE TABLE public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  environment public.environment_type NOT NULL DEFAULT 'live',
  amount bigint NOT NULL,
  fee bigint NOT NULL DEFAULT 0,
  net bigint NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  pix_key text NOT NULL,
  pix_key_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid NOT NULL REFERENCES public.users(id),
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  rejected_at timestamptz,
  failed_at timestamptz,
  correlation_id uuid,
  provider_reference text,
  failure_reason text,
  balance_transaction_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, environment, correlation_id)
);

CREATE TABLE public.platform_fee_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.organization_fee_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.acquirer_cost_config (
  acquirer_id text PRIMARY KEY,
  cost_percent numeric NOT NULL DEFAULT 0,
  cost_fixed_cents integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100
);
CREATE TABLE public.fee_rule_audit (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.withdrawal_decision_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  action text NOT NULL,
  actor_id uuid,
  reason text,
  state_before text,
  state_after text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS after all financial tables exist (matches migration 023 intent).
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
