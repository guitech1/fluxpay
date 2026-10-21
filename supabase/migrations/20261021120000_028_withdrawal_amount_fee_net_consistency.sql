-- 028: Align withdrawal amount/fee/net with fee-on-top product rule.
--
-- Product rule (see backend/src/services/withdrawal-fee.ts):
--   - User requests the amount they want to RECEIVE (net to recipient).
--   - Fee is charged on top of that amount.
--   - Total reserved from available balance = net + fee.
--   - Provider payout uses `net`.
--   - Available balance = sum(balance_transactions.net); the payout row must
--     therefore reduce net by the FULL total (amount), not only by net.
--
-- Columns on withdrawal_requests:
--   amount = total reserved (net + fee)
--   net    = value sent to PIX recipient
--   fee    = platform fee
-- Constraint: amount = net + fee

-- 1) Table-level consistency (idempotent).
DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'withdrawal_requests_net_consistent'
      AND conrelid = 'public.withdrawal_requests'::regclass
  ) THEN
    ALTER TABLE public.withdrawal_requests
      ADD CONSTRAINT withdrawal_requests_net_consistent
      CHECK (amount = net + fee);
  END IF;
END
$constraint$;

-- 2) Replace create RPC with consistent validation and full-balance reservation.
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
    RAISE EXCEPTION 'correlation_id is required for withdrawal idempotency'
      USING ERRCODE = '22023';
  END IF;

  -- Structural validation (before lock).
  IF p_amount <= 0 OR p_net_amount <= 0 OR p_fee_amount < 0 THEN
    RAISE EXCEPTION 'invalid withdrawal amounts'
      USING ERRCODE = '23514';
  END IF;
  -- Fee-on-top consistency: total reserved must equal net-to-recipient + fee.
  IF p_amount <> (p_net_amount + p_fee_amount) THEN
    RAISE EXCEPTION 'withdrawal amount must equal net + fee (got amount=%, net=%, fee=%)',
      p_amount, p_net_amount, p_fee_amount
      USING ERRCODE = '23514';
  END IF;
  IF p_pix_key IS NULL OR length(btrim(p_pix_key)) = 0 THEN
    RAISE EXCEPTION 'PIX key is required'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize concurrent withdrawals for the same organization.
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
      RAISE EXCEPTION 'correlation_id already belongs to a different withdrawal request'
        USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'id', existing_row.id,
      'organization_id', existing_row.organization_id,
      'environment', existing_row.environment,
      'amount', existing_row.amount,
      'fee', existing_row.fee,
      'net', existing_row.net,
      'currency', existing_row.currency,
      'pix_key', existing_row.pix_key,
      'pix_key_type', existing_row.pix_key_type,
      'status', existing_row.status,
      'requested_by', existing_row.requested_by,
      'approved_by', existing_row.approved_by,
      'approved_at', existing_row.approved_at,
      'rejected_at', existing_row.rejected_at,
      'rejection_reason', existing_row.rejection_reason,
      'failed_at', existing_row.failed_at,
      'correlation_id', existing_row.correlation_id,
      'provider_reference', existing_row.provider_reference,
      'failure_reason', existing_row.failure_reason,
      'balance_transaction_id', existing_row.balance_transaction_id,
      'created_at', existing_row.created_at,
      'updated_at', existing_row.updated_at
    );
  END IF;

  SELECT COALESCE(sum(net), 0)::bigint INTO available_balance
    FROM public.balance_transactions
   WHERE organization_id = p_organization_id
     AND environment = p_environment
     AND currency = 'BRL'
     AND (available_on IS NULL OR available_on <= NOW());

  -- Reserve the FULL total (net + fee).
  IF p_amount > available_balance THEN
    RAISE EXCEPTION 'insufficient available balance'
      USING ERRCODE = '23514';
  END IF;

  -- Ledger impact: available = sum(net). Debit the full total so the fee is
  -- actually reserved. amount column records the gross; fee is informational.
  INSERT INTO public.balance_transactions (
    organization_id, environment, type, amount, currency, net, fee,
    description, available_on
  ) VALUES (
    p_organization_id, p_environment, 'payout',
    -p_amount, 'BRL', -p_amount, p_fee_amount,
    p_description, NOW()
  ) RETURNING id INTO ledger_id;

  INSERT INTO public.withdrawal_requests (
    organization_id, environment, amount, fee, net, currency,
    pix_key, pix_key_type, status, requested_by, correlation_id, balance_transaction_id
  ) VALUES (
    p_organization_id, p_environment, p_amount, p_fee_amount, p_net_amount, 'BRL',
    btrim(p_pix_key), p_pix_key_type, 'pending', p_user_id, p_correlation_id, ledger_id
  ) RETURNING * INTO w;

  RETURN jsonb_build_object(
    'id', w.id,
    'organization_id', w.organization_id,
    'environment', w.environment,
    'amount', w.amount,
    'fee', w.fee,
    'net', w.net,
    'currency', w.currency,
    'pix_key', w.pix_key,
    'pix_key_type', w.pix_key_type,
    'status', w.status,
    'requested_by', w.requested_by,
    'approved_by', w.approved_by,
    'approved_at', w.approved_at,
    'rejected_at', NULL,
    'rejection_reason', w.rejection_reason,
    'failed_at', NULL,
    'correlation_id', w.correlation_id,
    'provider_reference', w.provider_reference,
    'failure_reason', w.failure_reason,
    'balance_transaction_id', w.balance_transaction_id,
    'created_at', w.created_at,
    'updated_at', w.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fluxpay_create_withdrawal_request(uuid, public.environment_type, uuid, bigint, bigint, bigint, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fluxpay_create_withdrawal_request(uuid, public.environment_type, uuid, bigint, bigint, bigint, text, text, uuid, text) TO service_role;

COMMENT ON FUNCTION public.fluxpay_create_withdrawal_request(uuid, public.environment_type, uuid, bigint, bigint, bigint, text, text, uuid, text) IS
  'Atomically reserves available balance for a fee-on-top withdrawal (amount = net + fee), creates the request, and deduplicates by correlation_id.';

-- 3) Rejection must restore the FULL reserved amount (amount column),
--    so available (sum net) returns to the pre-request value.
CREATE OR REPLACE FUNCTION public.fluxpay_reject_withdrawal(
  p_withdrawal_id uuid,
  p_admin_user_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  w public.withdrawal_requests%ROWTYPE;
BEGIN
  SELECT * INTO w
    FROM public.withdrawal_requests
   WHERE id = p_withdrawal_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'withdrawal not found' USING ERRCODE = 'P0002';
  END IF;

  IF w.status = 'rejected' THEN
    RETURN jsonb_build_object(
      'id', w.id, 'organization_id', w.organization_id, 'environment', w.environment,
      'amount', w.amount, 'fee', w.fee, 'net', w.net, 'currency', w.currency,
      'pix_key', w.pix_key, 'pix_key_type', w.pix_key_type, 'status', w.status,
      'requested_by', w.requested_by, 'approved_by', w.approved_by, 'approved_at', w.approved_at,
      'rejected_at', w.rejected_at, 'rejection_reason', w.rejection_reason, 'failed_at', w.failed_at,
      'correlation_id', w.correlation_id, 'provider_reference', w.provider_reference,
      'failure_reason', w.failure_reason, 'balance_transaction_id', w.balance_transaction_id,
      'created_at', w.created_at, 'updated_at', w.updated_at
    );
  END IF;

  IF w.status <> 'pending' THEN
    RAISE EXCEPTION 'only pending withdrawals can be rejected (current state %)', w.status
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.withdrawal_requests
     SET status = 'rejected',
         rejection_reason = p_reason,
         rejected_at = NOW()
   WHERE id = w.id
  RETURNING * INTO w;

  -- Restore full reserved total so available (sum net) is correct.
  INSERT INTO public.balance_transactions (
    organization_id, environment, type, amount, currency, net, fee,
    description, available_on
  ) VALUES (
    w.organization_id, w.environment, 'adjustment',
    w.amount, w.currency, w.amount, 0,
    'Estorno de saque rejeitado (' || left(w.id::text, 8) || ')', NOW()
  );

  INSERT INTO public.withdrawal_decision_audit (
    withdrawal_id, organization_id, action, actor_id, reason, state_before, state_after
  ) VALUES (
    w.id, w.organization_id, 'reject', p_admin_user_id, p_reason, 'pending', 'rejected'
  );

  RETURN jsonb_build_object(
    'id', w.id, 'organization_id', w.organization_id, 'environment', w.environment,
    'amount', w.amount, 'fee', w.fee, 'net', w.net, 'currency', w.currency,
    'pix_key', w.pix_key, 'pix_key_type', w.pix_key_type, 'status', w.status,
    'requested_by', w.requested_by, 'approved_by', w.approved_by, 'approved_at', w.approved_at,
    'rejected_at', w.rejected_at, 'rejection_reason', w.rejection_reason, 'failed_at', w.failed_at,
    'correlation_id', w.correlation_id, 'provider_reference', w.provider_reference,
    'failure_reason', w.failure_reason, 'balance_transaction_id', w.balance_transaction_id,
    'created_at', w.created_at, 'updated_at', w.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fluxpay_reject_withdrawal(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fluxpay_reject_withdrawal(uuid, uuid, text) TO service_role;
