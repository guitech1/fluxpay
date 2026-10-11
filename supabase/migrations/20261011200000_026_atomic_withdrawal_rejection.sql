-- 026: reject a pending withdrawal and release its reservation atomically.
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

  -- Idempotent replay: the state and release entry were committed together.
  IF w.status = 'rejected' THEN
    RETURN jsonb_build_object(
      'id', w.id, 'organization_id', w.organization_id, 'environment', w.environment,
      'amount', w.amount, 'fee', w.fee, 'net', w.net, 'currency', w.currency,
      'pix_key', w.pix_key, 'pix_key_type', w.pix_key_type, 'status', w.status,
      'requested_by', w.requested_by, 'approved_by', w.approved_by, 'approved_at', w.approved_at,
      'rejected_at', w.rejected_at, 'rejection_reason', w.rejection_reason, 'failed_at', w.failed_at,
      'correlation_id', w.correlation_id, 'provider_reference', w.provider_withdrawal_id,
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

  INSERT INTO public.balance_transactions (
    organization_id, environment, type, amount, currency, net, fee,
    description, available_on
  ) VALUES (
    w.organization_id, w.environment, 'adjustment', w.amount, w.currency,
    w.net, 0, 'Estorno de saque rejeitado (' || left(w.id::text, 8) || ')', NOW()
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
    'correlation_id', w.correlation_id, 'provider_reference', w.provider_withdrawal_id,
    'failure_reason', w.failure_reason, 'balance_transaction_id', w.balance_transaction_id,
    'created_at', w.created_at, 'updated_at', w.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fluxpay_reject_withdrawal(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fluxpay_reject_withdrawal(uuid, uuid, text) TO service_role;
