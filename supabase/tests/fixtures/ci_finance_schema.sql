-- Disposable PostgreSQL fixture for CI only. Never used against Supabase/live.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TYPE public.environment_type AS ENUM ('test', 'live');
CREATE TYPE public.payment_status AS ENUM ('pending','processing','succeeded','failed','canceled','expired','refunded','partially_refunded');
CREATE TYPE public.refund_status AS ENUM ('pending','succeeded','failed','canceled');

CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
INSERT INTO public.organizations(id,name) VALUES ('00000000-0000-0000-0000-000000000000','synthetic CI organization');

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

CREATE TABLE public.provider_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.webhook_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.withdrawal_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.platform_fee_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.organization_fee_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.acquirer_cost_config (acquirer_id text PRIMARY KEY);
CREATE TABLE public.fee_rule_audit (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.withdrawal_decision_audit (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

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
