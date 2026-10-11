-- 025: atomic withdrawal reservation, request creation and correlation idempotency.
-- Forward-only. Not yet applied on live at the time of this revision.
--
-- Migration 015 created fee_amount/net_amount/reviewed_by/reviewed_at.
-- Application code and this RPC use fee/net/approved_by/approved_at.
-- Ensure target columns exist before the function body references them.

DO $compat$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'withdrawal_requests' AND column_name = 'fee'
  ) THEN
    ALTER TABLE public.withdrawal_requests ADD COLUMN fee bigint NOT NULL DEFAULT 0;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'withdrawal_requests' AND column_name = 'fee_amount'
    ) THEN
      EXECUTE 'UPDATE public.withdrawal_requests SET fee = COALESCE(fee_amount, 0)';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'withdrawal_requests' AND column_name = 'net'
  ) THEN
    ALTER TABLE public.withdrawal_requests ADD COLUMN net bigint;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'withdrawal_requests' AND column_name = 'net_amount'
    ) THEN
      EXECUTE 'UPDATE public.withdrawal_requests SET net = net_amount WHERE net IS NULL';
    END IF;
    -- New requests always set net; remaining NULLs get amount as a safe fallback.
    EXECUTE 'UPDATE public.withdrawal_requests SET net = amount WHERE net IS NULL';
    ALTER TABLE public.withdrawal_requests ALTER COLUMN net SET NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'withdrawal_requests' AND column_name = 'approved_by'
  ) THEN
    ALTER TABLE public.withdrawal_requests ADD COLUMN approved_by uuid;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'withdrawal_requests' AND column_name = 'reviewed_by'
    ) THEN
      EXECUTE 'UPDATE public.withdrawal_requests SET approved_by = reviewed_by WHERE approved_by IS NULL';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'withdrawal_requests' AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE public.withdrawal_requests ADD COLUMN approved_at timestamptz;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'withdrawal_requests' AND column_name = 'reviewed_at'
    ) THEN
      EXECUTE 'UPDATE public.withdrawal_requests SET approved_at = reviewed_at WHERE approved_at IS NULL';
    END IF;
  END IF;
END
$compat$;

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

-- The organization row lock serializes concurrent withdrawal requests.
CREATE OR REPLACE FUNCTION public.fluxpay_create_withdrawal_request(
  p_organization_id uuid,
  p_environment public.environment_type,
  p_user_id uuid,
  p_amount bigint,
  p_fee_amount bigint,
  p_net_amount bigint,
  p_pix_key text,
  p_pix_key_type text,
  p_correlation_id uuid,
  p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing_row public.withdrawal_requests%ROWTYPE;
  w public.withdrawal_requests%ROWTYPE;
  ledger_id uuid;
  available_balance bigint;
BEGIN
  IF p_correlation_id IS NULL THEN
    RAISE EXCEPTION 'correlation_id is required for withdrawal idempotency' USING ERRCODE = '22023';
  END IF;
  IF p_amount <= 0 OR p_net_amount <= 0 OR p_fee_amount < 0 OR p_net_amount > p_amount THEN
    RAISE EXCEPTION 'invalid withdrawal amounts' USING ERRCODE = '23514';
  END IF;
  IF p_pix_key IS NULL OR length(btrim(p_pix_key)) = 0 THEN
    RAISE EXCEPTION 'PIX key is required' USING ERRCODE = '22023';
  END IF;

  -- Lock first, then check correlation and balance in the same transaction.
  PERFORM 1 FROM public.organizations WHERE id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO existing_row
    FROM public.withdrawal_requests
   WHERE organization_id = p_organization_id
     AND environment = p_environment
     AND correlation_id = p_correlation_id;

  IF FOUND THEN
    IF existing_row.amount <> p_amount
       OR existing_row.fee <> p_fee_amount
       OR existing_row.net <> p_net_amount
       OR existing_row.pix_key IS DISTINCT FROM p_pix_key
       OR existing_row.pix_key_type IS DISTINCT FROM p_pix_key_type THEN
      RAISE EXCEPTION 'correlation_id already belongs to a different withdrawal request' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'id', existing_row.id, 'organization_id', existing_row.organization_id,
      'environment', existing_row.environment, 'amount', existing_row.amount,
      'fee', existing_row.fee, 'net', existing_row.net,
      'currency', existing_row.currency, 'pix_key', existing_row.pix_key,
      'pix_key_type', existing_row.pix_key_type, 'status', existing_row.status,
      'requested_by', existing_row.requested_by, 'approved_by', existing_row.approved_by,
      'approved_at', existing_row.approved_at, 'rejected_at', existing_row.rejected_at,
      'rejection_reason', existing_row.rejection_reason, 'failed_at', existing_row.failed_at,
      'correlation_id', existing_row.correlation_id, 'provider_reference', existing_row.provider_withdrawal_id,
      'failure_reason', existing_row.failure_reason, 'balance_transaction_id', existing_row.balance_transaction_id,
      'created_at', existing_row.created_at, 'updated_at', existing_row.updated_at
    );
  END IF;

  SELECT COALESCE(sum(net), 0)::bigint INTO available_balance
    FROM public.balance_transactions
   WHERE organization_id = p_organization_id
     AND environment = p_environment
     AND currency = 'BRL'
     AND (available_on IS NULL OR available_on <= NOW());

  IF p_amount > available_balance THEN
    RAISE EXCEPTION 'insufficient available balance' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.balance_transactions (
    organization_id, environment, type, amount, currency, net, fee,
    description, available_on
  ) VALUES (
    p_organization_id, p_environment, 'payout', -p_amount, 'BRL', -p_net_amount,
    p_fee_amount, p_description, NOW()
  ) RETURNING id INTO ledger_id;

  INSERT INTO public.withdrawal_requests (
    organization_id, environment, amount, fee, net, currency,
    pix_key, pix_key_type, status, requested_by, correlation_id, balance_transaction_id
  ) VALUES (
    p_organization_id, p_environment, p_amount, p_fee_amount, p_net_amount, 'BRL',
    btrim(p_pix_key), p_pix_key_type, 'pending', p_user_id, p_correlation_id, ledger_id
  ) RETURNING * INTO w;

  RETURN jsonb_build_object(
    'id', w.id, 'organization_id', w.organization_id, 'environment', w.environment,
    'amount', w.amount, 'fee', w.fee, 'net', w.net, 'currency', w.currency,
    'pix_key', w.pix_key, 'pix_key_type', w.pix_key_type, 'status', w.status,
    'requested_by', w.requested_by, 'approved_by', w.approved_by, 'approved_at', w.approved_at,
    'rejected_at', NULL, 'rejection_reason', w.rejection_reason, 'failed_at', NULL,
    'correlation_id', w.correlation_id, 'provider_reference', w.provider_withdrawal_id,
    'failure_reason', w.failure_reason, 'balance_transaction_id', w.balance_transaction_id,
    'created_at', w.created_at, 'updated_at', w.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fluxpay_create_withdrawal_request(uuid, public.environment_type, uuid, bigint, bigint, bigint, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fluxpay_create_withdrawal_request(uuid, public.environment_type, uuid, bigint, bigint, bigint, text, text, uuid, text) TO service_role;

COMMENT ON FUNCTION public.fluxpay_create_withdrawal_request(uuid, public.environment_type, uuid, bigint, bigint, bigint, text, text, uuid, text) IS
  'Atomically checks available balance, reserves payout ledger funds, creates the request, and deduplicates by mandatory correlation_id.';
